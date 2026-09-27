import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/infrastructure/db/prisma";
import { canManageCircle, requireActiveMembership } from "@/modules/circle/circle-access";
import { requireCurrentUserId } from "@/modules/identity/current-user";
import { CircleManagement } from "./circle-management";

export default async function CircleManagementPage({ params }: { params: Promise<{ slug: string }> }) {
  const userId = await requireCurrentUserId(); const { slug } = await params; const membership = await requireActiveMembership(userId, slug); if (!membership) notFound();
  const manager = canManageCircle(membership.role);
  const [members, applications] = await Promise.all([
    prisma.circleMembership.findMany({ where: { circleId: membership.circleId, status: "ACTIVE" }, include: { user: { select: { id: true, displayName: true, email: true } } }, orderBy: [{ role: "asc" }, { createdAt: "asc" }] }),
    manager ? prisma.membershipApplication.findMany({ where: { circleId: membership.circleId, status: "PENDING" }, include: { membership: { include: { user: { select: { id: true, displayName: true, email: true } } } }, invitation: { select: { type: true } } }, orderBy: { submittedAt: "asc" } }) : Promise.resolve([]),
  ]);
  return <main className="min-h-screen px-5 py-6 sm:px-10"><section className="mx-auto max-w-4xl"><Link className="text-sm font-semibold text-[var(--brand)]" href={`/app/circles/${slug}`}>← {membership.circle.name}</Link><h1 className="mt-6 text-4xl font-bold tracking-tight">圈子管理与邀请</h1><p className="mt-3 text-[var(--muted)]">所有有效成员可创建邀请；受邀者仍需管理员审批才能进入圈子。</p><CircleManagement slug={slug} role={membership.role} members={members.map((item) => ({ userId: item.userId, name: item.user.displayName || item.user.email, role: item.role }))} applications={applications.map((item) => ({ id: item.id, name: item.membership.user.displayName || item.membership.user.email, email: item.membership.user.email, invitationType: item.invitation?.type ?? null }))} /></section></main>;
}
