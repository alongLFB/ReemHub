import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/infrastructure/db/prisma";
import { requireActiveMembership } from "@/modules/circle/circle-access";
import { requireCurrentUserId } from "@/modules/identity/current-user";
import { BillDetail } from "./bill-detail";

export default async function BillDetailPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const userId = await requireCurrentUserId(); const { slug, id } = await params;
  const membership = await requireActiveMembership(userId, slug); if (!membership) notFound();
  const bill = await prisma.bill.findFirst({ where: { id, circleId: membership.circleId }, include: { participants: true, expenses: { include: { payer: true, splits: { include: { participant: true } } }, orderBy: { createdAt: "asc" } }, transfers: { where: { status: { not: "SUPERSEDED" } }, include: { fromParticipant: true, toParticipant: true }, orderBy: { createdAt: "asc" } } } });
  if (!bill) notFound();
  return <main className="min-h-screen px-5 py-6 sm:px-10"><section className="mx-auto max-w-4xl"><Link className="text-sm font-semibold text-[var(--brand)]" href={`/app/circles/${slug}/bills`}>← AA 账单</Link><BillDetail slug={slug} bill={{ id: bill.id, title: bill.title, status: bill.status, creatorId: bill.creatorId, participants: bill.participants.map((item) => ({ id: item.id, name: item.displayNameSnapshot, userId: item.userId })), expenses: bill.expenses.map((item) => ({ id: item.id, title: item.title, amountAed: Number(item.amountAed), method: item.splitMethod, payer: item.payer.displayNameSnapshot, splits: item.splits.map((split) => ({ name: split.participant.displayNameSnapshot, amountAed: Number(split.amountAed) })) })), transfers: bill.transfers.map((item) => ({ id: item.id, from: item.fromParticipant.displayNameSnapshot, fromUserId: item.fromParticipant.userId, to: item.toParticipant.displayNameSnapshot, amountAed: Number(item.amountAed), status: item.status })) }} currentUserId={userId} /></section></main>;
}
