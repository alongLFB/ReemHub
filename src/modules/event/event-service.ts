import { EventRegistrationStatus, EventStatus, Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/db/prisma";
import { canManageCircle, requireActiveMembership } from "@/modules/circle/circle-access";
import { writeAuditEvent } from "@/modules/audit/write-audit-event";
import { createNotification } from "@/modules/notification/notification-service";

export class EventServiceError extends Error {}

export async function createEvent(input: {
  userId: string;
  slug: string;
  title: string;
  eventTime: Date;
  locationName?: string;
  notes?: string;
  restaurantId?: string;
  maxParticipants?: number;
  registrationDeadline?: Date;
  waitlistEnabled: boolean;
  reminderOffsets?: number[];
}) {
  const membership = await requireActiveMembership(input.userId, input.slug);
  if (!membership) throw new EventServiceError("你不是该圈子的有效成员。");
  if (input.waitlistEnabled && !input.maxParticipants) {
    throw new EventServiceError("设置人数上限后才能开启候补名单。");
  }
  if (input.registrationDeadline && input.registrationDeadline > input.eventTime) {
    throw new EventServiceError("报名截止时间不能晚于活动时间。");
  }
  if (input.restaurantId) {
    const restaurant = await prisma.restaurant.findFirst({
      where: { id: input.restaurantId, circleId: membership.circleId },
      select: { id: true },
    });
    if (!restaurant) throw new EventServiceError("关联餐厅不属于当前圈子。");
  }

  const event = await prisma.event.create({
    data: {
      circleId: membership.circleId,
      creatorId: input.userId,
      title: input.title,
      eventTime: input.eventTime,
      locationName: input.locationName || null,
      notes: input.notes || null,
      restaurantId: input.restaurantId || null,
      maxParticipants: input.maxParticipants ?? null,
      registrationDeadline: input.registrationDeadline ?? null,
      waitlistEnabled: input.waitlistEnabled,
      reminders: input.reminderOffsets?.length ? { create: input.reminderOffsets.map((offsetMinutes) => ({ offsetMinutes, scheduledAt: new Date(input.eventTime.getTime() - offsetMinutes * 60_000) })) } : undefined,
    },
  });
  await writeAuditEvent(prisma, {
    actorId: input.userId,
    circleId: membership.circleId,
    eventType: "EVENT_CREATED",
    entityType: "Event",
    entityId: event.id,
  });
  return event;
}

async function getManageableEvent(userId: string, slug: string, eventId: string) {
  const membership = await requireActiveMembership(userId, slug);
  if (!membership) throw new EventServiceError("你不是该圈子的有效成员。");
  const event = await prisma.event.findFirst({ where: { id: eventId, circleId: membership.circleId } });
  if (!event) throw new EventServiceError("活动不存在。");
  if (event.creatorId !== userId && !canManageCircle(membership.role)) throw new EventServiceError("只有活动创建者或圈子管理员可以管理活动。");
  return { membership, event };
}

export async function updateEvent(input: {
  userId: string;
  slug: string;
  eventId: string;
  title: string;
  eventTime: Date;
  locationName?: string;
  notes?: string;
  restaurantId?: string;
  maxParticipants?: number;
  registrationDeadline?: Date;
  waitlistEnabled: boolean;
  status: EventStatus;
  reminderOffsets: number[];
}) {
  const { membership, event } = await getManageableEvent(input.userId, input.slug, input.eventId);
  if (input.waitlistEnabled && !input.maxParticipants) throw new EventServiceError("设置人数上限后才能开启候补名单。");
  if (input.registrationDeadline && input.registrationDeadline > input.eventTime) throw new EventServiceError("报名截止时间不能晚于活动时间。");
  if (input.restaurantId) {
    const restaurant = await prisma.restaurant.findFirst({ where: { id: input.restaurantId, circleId: membership.circleId }, select: { id: true } });
    if (!restaurant) throw new EventServiceError("关联餐厅不属于当前圈子。");
  }
  const updated = await prisma.$transaction(async (tx) => {
    await tx.eventReminder.deleteMany({ where: { eventId: event.id, sentAt: null } });
    return tx.event.update({
      where: { id: event.id },
      data: {
        title: input.title,
        eventTime: input.eventTime,
        locationName: input.locationName || null,
        notes: input.notes || null,
        restaurantId: input.restaurantId || null,
        maxParticipants: input.maxParticipants ?? null,
        registrationDeadline: input.registrationDeadline ?? null,
        waitlistEnabled: input.waitlistEnabled,
        status: input.status,
        reminders: input.reminderOffsets.length ? { create: input.reminderOffsets.map((offsetMinutes) => ({ offsetMinutes, scheduledAt: new Date(input.eventTime.getTime() - offsetMinutes * 60_000) })) } : undefined,
      },
    });
  });
  await writeAuditEvent(prisma, { actorId: input.userId, circleId: membership.circleId, eventType: "EVENT_UPDATED", entityType: "Event", entityId: event.id });
  return updated;
}

export async function deleteEvent(input: { userId: string; slug: string; eventId: string }) {
  const { membership, event } = await getManageableEvent(input.userId, input.slug, input.eventId);
  await prisma.event.delete({ where: { id: event.id } });
  await writeAuditEvent(prisma, { actorId: input.userId, circleId: membership.circleId, eventType: "EVENT_DELETED", entityType: "Event", entityId: event.id });
}

export async function adjustEventRoster(input: {
  userId: string;
  slug: string;
  eventId: string;
  targetUserId: string;
  status: EventRegistrationStatus;
  reason?: string;
}) {
  const { membership, event } = await getManageableEvent(input.userId, input.slug, input.eventId);
  const targetMembership = await prisma.circleMembership.findUnique({ where: { circleId_userId: { circleId: membership.circleId, userId: input.targetUserId } } });
  if (!targetMembership || targetMembership.status !== "ACTIVE") throw new EventServiceError("只能调整圈内有效成员的名单。");
  const before = await prisma.eventRegistration.findUnique({ where: { eventId_userId: { eventId: event.id, userId: input.targetUserId } } });
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    if (before) {
      await tx.eventRegistration.update({ where: { id: before.id }, data: { status: input.status, joinedAt: input.status === EventRegistrationStatus.GOING ? now : before.joinedAt, waitlistedAt: input.status === EventRegistrationStatus.WAITLIST ? now : null } });
    } else {
      await tx.eventRegistration.create({ data: { eventId: event.id, userId: input.targetUserId, status: input.status, joinedAt: now, waitlistedAt: input.status === EventRegistrationStatus.WAITLIST ? now : null } });
    }
    await tx.eventRosterAdjustment.create({ data: { eventId: event.id, targetUserId: input.targetUserId, actorId: input.userId, source: "MANUAL_ADJUSTMENT", beforeStatus: before?.status, afterStatus: input.status, reason: input.reason || null } });
  });
  await writeAuditEvent(prisma, { actorId: input.userId, circleId: membership.circleId, eventType: "EVENT_ROSTER_ADJUSTED", entityType: "EventRegistration", entityId: before?.id ?? `${event.id}:${input.targetUserId}`, metadata: { targetUserId: input.targetUserId, status: input.status, hasReason: Boolean(input.reason) } });
}

export async function registerForEvent(input: { userId: string; slug: string; eventId: string }) {
  const membership = await requireActiveMembership(input.userId, input.slug);
  if (!membership) throw new EventServiceError("你不是该圈子的有效成员。");

  return prisma.$transaction(async (tx) => {
    const event = await tx.event.findFirst({
      where: { id: input.eventId, circleId: membership.circleId },
      include: {
        registrations: {
          where: { status: EventRegistrationStatus.GOING },
          select: { id: true },
        },
      },
    });
    if (!event || event.status !== EventStatus.OPEN) throw new EventServiceError("活动目前不接受报名。");
    if (event.registrationDeadline && event.registrationDeadline <= new Date()) {
      throw new EventServiceError("报名已经截止。");
    }

    const existing = await tx.eventRegistration.findUnique({
      where: { eventId_userId: { eventId: event.id, userId: input.userId } },
    });
    if (existing?.status === EventRegistrationStatus.GOING || existing?.status === EventRegistrationStatus.WAITLIST) {
      throw new EventServiceError("你已报名或正在候补名单中。");
    }

    const atCapacity = Boolean(event.maxParticipants && event.registrations.length >= event.maxParticipants);
    if (atCapacity && !event.waitlistEnabled) throw new EventServiceError("活动已满员。");
    const status = atCapacity ? EventRegistrationStatus.WAITLIST : EventRegistrationStatus.GOING;
    const now = new Date();
    const registration = existing
      ? await tx.eventRegistration.update({
          where: { id: existing.id },
          data: { status, joinedAt: now, waitlistedAt: status === EventRegistrationStatus.WAITLIST ? now : null },
        })
      : await tx.eventRegistration.create({
          data: {
            eventId: event.id,
            userId: input.userId,
            status,
            joinedAt: now,
            waitlistedAt: status === EventRegistrationStatus.WAITLIST ? now : null,
          },
        });
    await tx.eventRosterAdjustment.create({
      data: {
        eventId: event.id,
        targetUserId: input.userId,
        actorId: input.userId,
        source: "SELF_REGISTRATION",
        afterStatus: status,
      },
    });
    await writeAuditEvent(tx, {
      actorId: input.userId,
      circleId: membership.circleId,
      eventType: "EVENT_REGISTRATION_CREATED",
      entityType: "EventRegistration",
      entityId: registration.id,
      metadata: { status },
    });
    return status;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function cancelEventRegistration(input: { userId: string; slug: string; eventId: string }) {
  const membership = await requireActiveMembership(input.userId, input.slug);
  if (!membership) throw new EventServiceError("你不是该圈子的有效成员。");

  const promoted = await prisma.$transaction(async (tx) => {
    const event = await tx.event.findFirst({
      where: { id: input.eventId, circleId: membership.circleId },
      select: { id: true, waitlistEnabled: true },
    });
    if (!event) throw new EventServiceError("活动不存在。");
    const registration = await tx.eventRegistration.findUnique({
      where: { eventId_userId: { eventId: event.id, userId: input.userId } },
    });
    if (!registration || registration.status === EventRegistrationStatus.CANCELLED) throw new EventServiceError("你没有可取消的报名。");

    await tx.eventRegistration.update({
      where: { id: registration.id },
      data: { status: EventRegistrationStatus.CANCELLED },
    });
    await tx.eventRosterAdjustment.create({
      data: {
        eventId: event.id,
        targetUserId: input.userId,
        actorId: input.userId,
        source: "SELF_CANCELLATION",
        beforeStatus: registration.status,
        afterStatus: EventRegistrationStatus.CANCELLED,
      },
    });

    if (registration.status === EventRegistrationStatus.GOING && event.waitlistEnabled) {
      const next = await tx.eventRegistration.findFirst({
        where: { eventId: event.id, status: EventRegistrationStatus.WAITLIST },
        orderBy: [{ waitlistedAt: "asc" }, { id: "asc" }],
      });
      if (next) {
        await tx.eventRegistration.update({
          where: { id: next.id },
          data: { status: EventRegistrationStatus.GOING, waitlistedAt: null },
        });
        await tx.eventRosterAdjustment.create({
          data: {
            eventId: event.id,
            targetUserId: next.userId,
            source: "SYSTEM_PROMOTION",
            beforeStatus: EventRegistrationStatus.WAITLIST,
            afterStatus: EventRegistrationStatus.GOING,
          },
        });
        return next.userId;
      }
    }
    return null;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (promoted) await createNotification({ userId: promoted, type: "EVENT_WAITLIST_PROMOTED", title: "候补已转正", body: "活动名额空出，你已从候补名单转为正式参与者。", targetUrl: `/app/circles/${input.slug}/events` });
}

export async function canManageEvent(input: { userId: string; slug: string; eventId: string }) {
  const membership = await requireActiveMembership(input.userId, input.slug);
  if (!membership) return false;
  const event = await prisma.event.findFirst({ where: { id: input.eventId, circleId: membership.circleId }, select: { creatorId: true } });
  return Boolean(event && (event.creatorId === input.userId || canManageCircle(membership.role)));
}
