import { CircleVisibility, DissolutionMode, InvitationType, MembershipRole, MembershipStatus, ProfileField } from "@prisma/client";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { prisma } from "@/infrastructure/db/prisma";
import { writeAuditEvent } from "@/modules/audit/write-audit-event";
import { createNotification } from "@/modules/notification/notification-service";

export class CircleServiceError extends Error {}

function slugBase(name: string) {
  const normalized = name
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || "circle";
}

async function uniqueSlug(name: string) {
  const base = slugBase(name).slice(0, 100);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const suffix = Math.random().toString(36).slice(2, 8);
    const slug = attempt === 0 ? base : base + "-" + suffix;
    const existing = await prisma.circle.findUnique({ where: { slug }, select: { id: true } });
    if (!existing) {
      return slug;
    }
  }
  return base + "-" + randomUUID().slice(0, 8);
}

export async function createCircle(input: {
  userId: string;
  name: string;
  description?: string;
  visibility: CircleVisibility;
  tags: string[];
}) {
  const slug = await uniqueSlug(input.name);
  const fields = Object.values(ProfileField);

  return prisma.$transaction(async (tx) => {
    const circle = await tx.circle.create({
      data: {
        name: input.name,
        slug,
        description: input.description || null,
        visibility: input.visibility,
        tags: input.tags,
        creatorId: input.userId,
      },
    });

    const membership = await tx.circleMembership.create({
      data: {
        circleId: circle.id,
        userId: input.userId,
        status: MembershipStatus.ACTIVE,
        role: MembershipRole.OWNER,
        approvedAt: new Date(),
      },
    });

    await tx.membershipProfileVisibility.createMany({
      data: fields.map((field) => ({
        membershipId: membership.id,
        field,
        isVisible: field === ProfileField.DISPLAY_NAME || field === ProfileField.AVATAR,
      })),
    });

    await writeAuditEvent(tx, {
      actorId: input.userId,
      circleId: circle.id,
      eventType: "CIRCLE_CREATED",
      entityType: "Circle",
      entityId: circle.id,
      metadata: { visibility: input.visibility },
    });

    return circle;
  });
}

export async function applyToPublicCircle(input: { userId: string; slug: string }) {
  return prisma.$transaction(async (tx) => {
    const circle = await tx.circle.findFirst({
      where: {
        slug: input.slug,
        visibility: CircleVisibility.PUBLIC,
        status: "ACTIVE",
      },
      select: { id: true, name: true },
    });
    if (!circle) {
      throw new CircleServiceError("圈子不存在或不接受公开申请。");
    }

    const existing = await tx.circleMembership.findUnique({
      where: { circleId_userId: { circleId: circle.id, userId: input.userId } },
    });
    if (existing?.status === MembershipStatus.ACTIVE) {
      throw new CircleServiceError("你已经是该圈子的成员。");
    }
    if (existing?.status === MembershipStatus.PENDING) {
      throw new CircleServiceError("你的申请正在等待管理员处理。");
    }

    const membership = existing
      ? await tx.circleMembership.update({
          where: { id: existing.id },
          data: {
            status: MembershipStatus.PENDING,
            role: MembershipRole.MEMBER,
            leftAt: null,
            removedAt: null,
          },
        })
      : await tx.circleMembership.create({
          data: {
            circleId: circle.id,
            userId: input.userId,
            status: MembershipStatus.PENDING,
          },
        });

    await tx.membershipApplication.create({
      data: {
        membershipId: membership.id,
        circleId: circle.id,
        userId: input.userId,
        status: MembershipStatus.PENDING,
      },
    });

    await writeAuditEvent(tx, {
      actorId: input.userId,
      circleId: circle.id,
      eventType: "CIRCLE_APPLICATION_SUBMITTED",
      entityType: "CircleMembership",
      entityId: membership.id,
    });

    return { circleName: circle.name };
  });
}

function hashInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function requireCircleManager(userId: string, slug: string) {
  const membership = await prisma.circleMembership.findFirst({
    where: { userId, status: MembershipStatus.ACTIVE, circle: { slug, status: "ACTIVE" } },
    include: { circle: true },
  });
  if (!membership || (membership.role !== MembershipRole.OWNER && membership.role !== MembershipRole.ADMIN)) {
    throw new CircleServiceError("只有圈主或管理员可以执行此操作。");
  }
  return membership;
}

export async function createInvitation(input: {
  userId: string;
  slug: string;
  type: InvitationType;
  expiresAt?: Date;
  maxUses?: number;
}) {
  const membership = await prisma.circleMembership.findFirst({
    where: { userId: input.userId, status: MembershipStatus.ACTIVE, circle: { slug: input.slug, status: "ACTIVE" } },
    include: { circle: true },
  });
  if (!membership) throw new CircleServiceError("只有有效成员可以创建邀请。");
  if (input.expiresAt && input.expiresAt <= new Date()) throw new CircleServiceError("邀请过期时间必须晚于当前时间。");
  const token = randomBytes(18).toString("base64url");
  const invitation = await prisma.circleInvitation.create({
    data: {
      circleId: membership.circleId,
      createdById: input.userId,
      type: input.type,
      tokenHash: hashInvitationToken(token),
      expiresAt: input.expiresAt ?? null,
      maxUses: input.maxUses ?? null,
    },
  });
  await writeAuditEvent(prisma, {
    actorId: input.userId,
    circleId: membership.circleId,
    eventType: "CIRCLE_INVITATION_CREATED",
    entityType: "CircleInvitation",
    entityId: invitation.id,
    metadata: { type: input.type, maxUses: input.maxUses ?? null },
  });
  return { id: invitation.id, token, expiresAt: invitation.expiresAt, maxUses: invitation.maxUses };
}

export async function applyWithInvitation(input: { userId: string; token: string }) {
  return prisma.$transaction(async (tx) => {
    const invitation = await tx.circleInvitation.findFirst({
      where: {
        tokenHash: hashInvitationToken(input.token),
        revokedAt: null,
        circle: { status: "ACTIVE" },
      },
      include: { circle: true },
    });
    if (!invitation || (invitation.expiresAt && invitation.expiresAt <= new Date()) || (invitation.maxUses !== null && invitation.usedCount >= invitation.maxUses)) {
      throw new CircleServiceError("邀请链接或邀请码无效、已过期或已用完。");
    }
    const existing = await tx.circleMembership.findUnique({ where: { circleId_userId: { circleId: invitation.circleId, userId: input.userId } } });
    if (existing?.status === MembershipStatus.ACTIVE) throw new CircleServiceError("你已经是该圈子的成员。");
    if (existing?.status === MembershipStatus.PENDING) throw new CircleServiceError("你的申请正在等待管理员处理。");
    const membership = existing
      ? await tx.circleMembership.update({ where: { id: existing.id }, data: { status: MembershipStatus.PENDING, role: MembershipRole.MEMBER, leftAt: null, removedAt: null } })
      : await tx.circleMembership.create({ data: { circleId: invitation.circleId, userId: input.userId, status: MembershipStatus.PENDING } });
    await tx.membershipApplication.create({ data: { membershipId: membership.id, circleId: invitation.circleId, userId: input.userId, invitationId: invitation.id } });
    await tx.circleInvitation.update({ where: { id: invitation.id }, data: { usedCount: { increment: 1 } } });
    await writeAuditEvent(tx, { actorId: input.userId, circleId: invitation.circleId, eventType: "CIRCLE_INVITATION_APPLIED", entityType: "CircleMembership", entityId: membership.id, metadata: { invitationId: invitation.id } });
    return { circleName: invitation.circle.name, slug: invitation.circle.slug };
  });
}

export async function reviewApplication(input: { userId: string; slug: string; applicationId: string; approve: boolean }) {
  const manager = await requireCircleManager(input.userId, input.slug);
  const result = await prisma.$transaction(async (tx) => {
    const application = await tx.membershipApplication.findFirst({
      where: { id: input.applicationId, circleId: manager.circleId, status: MembershipStatus.PENDING },
      include: { membership: true },
    });
    if (!application) throw new CircleServiceError("待处理的入圈申请不存在。");
    const status = input.approve ? MembershipStatus.ACTIVE : MembershipStatus.REJECTED;
    await tx.membershipApplication.update({ where: { id: application.id }, data: { status, reviewedAt: new Date(), reviewedById: input.userId } });
    const membership = await tx.circleMembership.update({
      where: { id: application.membershipId },
      data: { status, approvedAt: input.approve ? new Date() : null },
    });
    if (input.approve) {
      await tx.membershipProfileVisibility.createMany({
        data: Object.values(ProfileField).map((field) => ({ membershipId: membership.id, field, isVisible: field === ProfileField.DISPLAY_NAME || field === ProfileField.AVATAR })),
        skipDuplicates: true,
      });
    }
    await writeAuditEvent(tx, { actorId: input.userId, circleId: manager.circleId, eventType: input.approve ? "CIRCLE_APPLICATION_APPROVED" : "CIRCLE_APPLICATION_REJECTED", entityType: "MembershipApplication", entityId: application.id, metadata: { targetUserId: application.userId } });
    return { membership, targetUserId: application.userId };
  });
  await createNotification({ userId: result.targetUserId, type: input.approve ? "CIRCLE_APPLICATION_APPROVED" : "CIRCLE_APPLICATION_REJECTED", title: input.approve ? "入圈申请已通过" : "入圈申请未通过", body: input.approve ? `你已加入 ${manager.circle.name}。` : `你加入 ${manager.circle.name} 的申请未获通过。`, targetUrl: input.approve ? `/app/circles/${input.slug}` : "/app" });
  return result.membership;
}

export async function setMembershipRole(input: { userId: string; slug: string; targetUserId: string; role: "ADMIN" | "MEMBER" }) {
  const manager = await requireCircleManager(input.userId, input.slug);
  if (manager.role !== MembershipRole.OWNER) throw new CircleServiceError("只有圈主可以任命或撤销管理员。");
  if (input.targetUserId === input.userId) throw new CircleServiceError("请使用转让功能变更圈主身份。");
  const target = await prisma.circleMembership.findUnique({ where: { circleId_userId: { circleId: manager.circleId, userId: input.targetUserId } } });
  if (!target || target.status !== MembershipStatus.ACTIVE || target.role === MembershipRole.OWNER) throw new CircleServiceError("目标不是可调整的有效成员。");
  await prisma.circleMembership.update({ where: { id: target.id }, data: { role: input.role } });
  await writeAuditEvent(prisma, { actorId: input.userId, circleId: manager.circleId, eventType: "CIRCLE_MEMBER_ROLE_CHANGED", entityType: "CircleMembership", entityId: target.id, metadata: { targetUserId: input.targetUserId, role: input.role } });
}

export async function transferCircleOwnership(input: { userId: string; slug: string; targetUserId: string }) {
  const manager = await requireCircleManager(input.userId, input.slug);
  if (manager.role !== MembershipRole.OWNER) throw new CircleServiceError("只有圈主可以转让圈主身份。");
  if (input.targetUserId === input.userId) throw new CircleServiceError("目标成员已经是圈主。");
  const target = await prisma.circleMembership.findUnique({ where: { circleId_userId: { circleId: manager.circleId, userId: input.targetUserId } } });
  if (!target || target.status !== MembershipStatus.ACTIVE) throw new CircleServiceError("只能转让给圈内有效成员。");
  await prisma.$transaction(async (tx) => {
    await tx.circleMembership.update({ where: { id: manager.id }, data: { role: MembershipRole.ADMIN } });
    await tx.circleMembership.update({ where: { id: target.id }, data: { role: MembershipRole.OWNER } });
    await tx.circle.update({ where: { id: manager.circleId }, data: { creatorId: input.targetUserId } });
    await writeAuditEvent(tx, { actorId: input.userId, circleId: manager.circleId, eventType: "CIRCLE_OWNERSHIP_TRANSFERRED", entityType: "Circle", entityId: manager.circleId, metadata: { targetUserId: input.targetUserId } });
  });
}

export async function dissolveCircle(input: { userId: string; slug: string; mode: DissolutionMode }) {
  const manager = await requireCircleManager(input.userId, input.slug);
  if (manager.role !== MembershipRole.OWNER) throw new CircleServiceError("只有圈主可以解散圈子。");
  if (input.mode === DissolutionMode.DELETE_NOW) {
    await prisma.circle.delete({ where: { id: manager.circleId } });
    return;
  }
  const now = new Date();
  const purgeAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  await prisma.$transaction(async (tx) => {
    await tx.circle.update({ where: { id: manager.circleId }, data: { status: "DISSOLVED", dissolvedAt: now, purgeAt } });
    await tx.circleDissolution.create({ data: { circleId: manager.circleId, initiatedById: input.userId, mode: input.mode, dissolvedAt: now, purgeAt } });
    await writeAuditEvent(tx, { actorId: input.userId, circleId: manager.circleId, eventType: "CIRCLE_DISSOLVED", entityType: "Circle", entityId: manager.circleId, metadata: { mode: input.mode, purgeAt } });
  });
}

export async function restoreCircle(input: { userId: string; slug: string }) {
  const circle = await prisma.circle.findUnique({ where: { slug: input.slug } });
  if (!circle || circle.creatorId !== input.userId || circle.status !== "DISSOLVED" || (circle.purgeAt && circle.purgeAt <= new Date())) throw new CircleServiceError("该圈子无法恢复。");
  await prisma.$transaction(async (tx) => {
    await tx.circle.update({ where: { id: circle.id }, data: { status: "ACTIVE", dissolvedAt: null, purgeAt: null } });
    await tx.circleDissolution.updateMany({ where: { circleId: circle.id, restoredAt: null }, data: { restoredAt: new Date() } });
    await writeAuditEvent(tx, { actorId: input.userId, circleId: circle.id, eventType: "CIRCLE_RESTORED", entityType: "Circle", entityId: circle.id });
  });
}
