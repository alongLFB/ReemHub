import { MembershipStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveMembership, canManageCircle } from "@/modules/circle/circle-access";
import { CircleServiceError, reviewApplication } from "@/modules/circle/circle-service";
import { getCurrentUserId } from "@/modules/identity/current-user";
import { prisma } from "@/infrastructure/db/prisma";

const schema = z.object({ applicationId: z.string().uuid(), approve: z.boolean() });

export async function GET(_: Request, context: { params: Promise<{ slug: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const { slug } = await context.params;
  const membership = await requireActiveMembership(userId, slug);
  if (!membership || !canManageCircle(membership.role)) return NextResponse.json({ error: "没有管理权限。" }, { status: 403 });
  const applications = await prisma.membershipApplication.findMany({
    where: { circleId: membership.circleId, status: MembershipStatus.PENDING },
    include: { membership: { include: { user: { select: { id: true, displayName: true, email: true } } } }, invitation: { select: { type: true } } },
    orderBy: { submittedAt: "asc" },
  });
  return NextResponse.json(applications.map((item) => ({ id: item.id, submittedAt: item.submittedAt, invitationType: item.invitation?.type ?? null, user: item.membership.user })));
}

export async function PATCH(request: Request, context: { params: Promise<{ slug: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "审批参数不正确。" }, { status: 400 });
  try {
    const { slug } = await context.params;
    await reviewApplication({ userId, slug, ...parsed.data });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof CircleServiceError ? error.message : "审批失败。" }, { status: 400 });
  }
}
