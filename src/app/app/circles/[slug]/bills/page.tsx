import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/infrastructure/db/prisma";
import { requireActiveMembership } from "@/modules/circle/circle-access";
import { requireCurrentUserId } from "@/modules/identity/current-user";
import { BillList } from "./bill-list";

export default async function BillsPage({ params }: { params: Promise<{ slug: string }> }) {
  const userId = await requireCurrentUserId();
  const { slug } = await params;
  const membership = await requireActiveMembership(userId, slug);
  if (!membership) notFound();
  const [members, bills, events] = await Promise.all([
    prisma.circleMembership.findMany({ where: { circleId: membership.circleId, status: "ACTIVE" }, include: { user: { select: { id: true, displayName: true, email: true } } }, orderBy: { user: { displayName: "asc" } } }),
    prisma.bill.findMany({ where: { circleId: membership.circleId }, include: { creator: { select: { displayName: true } }, participants: true, expenses: true, transfers: { where: { status: { not: "SUPERSEDED" } } } }, orderBy: { updatedAt: "desc" } }),
    prisma.event.findMany({ where: { circleId: membership.circleId }, select: { id: true, title: true, eventTime: true }, orderBy: { eventTime: "desc" }, take: 50 }),
  ]);
  return <main className="min-h-screen px-5 py-6 sm:px-10"><section className="mx-auto max-w-5xl">
    <Link className="text-sm font-semibold text-[var(--brand)]" href={`/app/circles/${slug}`}>← {membership.circle.name}</Link>
    <h1 className="mt-6 text-4xl font-bold tracking-tight">AA 账单</h1><p className="mt-3 text-[var(--muted)]">账单创建者独占编辑、结算及重新开启权限；可添加圈友和临时 Guest。</p>
    <BillList slug={slug} members={members.map((item) => ({ id: item.user.id, name: item.user.displayName || item.user.email }))} events={events.map((item) => ({ id: item.id, title: item.title }))} bills={bills.map((bill) => ({ id: bill.id, title: bill.title, status: bill.status, creatorName: bill.creator.displayName || "圈友", creatorId: bill.creatorId, participantCount: bill.participants.length, expenseTotalAed: bill.expenses.reduce((sum, item) => sum + Number(item.amountAed), 0), transferCount: bill.transfers.length }))} currentUserId={userId} />
  </section></main>;
}
