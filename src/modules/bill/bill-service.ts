import { BillParticipantType, BillStatus, Prisma, SplitMethod, TransferStatus } from "@prisma/client";
import { prisma } from "@/infrastructure/db/prisma";
import { requireActiveMembership } from "@/modules/circle/circle-access";
import { writeAuditEvent } from "@/modules/audit/write-audit-event";
import { calculateExpenseSplits, calculateSettlement, type SplitInput } from "./calculator";

export class BillServiceError extends Error {}

const toFils = (amount: number) => Math.round(amount * 100);
const fromFils = (fils: number) => new Prisma.Decimal(fils).div(100);

async function getCreatorBill(userId: string, slug: string, billId: string) {
  const membership = await requireActiveMembership(userId, slug);
  if (!membership) throw new BillServiceError("你不是该圈子的有效成员。");
  const bill = await prisma.bill.findFirst({ where: { id: billId, circleId: membership.circleId }, include: { participants: true } });
  if (!bill) throw new BillServiceError("账单不存在。");
  if (bill.creatorId !== userId) throw new BillServiceError("只有账单创建者可以编辑、结算或重新开启账单。");
  return { membership, bill };
}

export async function createBill(input: { userId: string; slug: string; title: string; eventId?: string; memberIds: string[]; guestNames: string[] }) {
  const membership = await requireActiveMembership(input.userId, input.slug);
  if (!membership) throw new BillServiceError("你不是该圈子的有效成员。");
  const memberIds = [...new Set(input.memberIds)];
  const guestNames = [...new Set(input.guestNames.map((name) => name.trim()).filter(Boolean))];
  if (!memberIds.length && !guestNames.length) throw new BillServiceError("账单至少需要一位参与者。");
  const members = memberIds.length ? await prisma.circleMembership.findMany({ where: { circleId: membership.circleId, userId: { in: memberIds }, status: "ACTIVE" }, include: { user: { select: { id: true, displayName: true } } } }) : [];
  if (members.length !== memberIds.length) throw new BillServiceError("账单成员必须是当前圈子的有效成员。");
  if (input.eventId) {
    const event = await prisma.event.findFirst({ where: { id: input.eventId, circleId: membership.circleId }, select: { id: true } });
    if (!event) throw new BillServiceError("关联活动不属于当前圈子。");
  }
  const bill = await prisma.bill.create({
    data: {
      circleId: membership.circleId,
      creatorId: input.userId,
      title: input.title,
      eventId: input.eventId || null,
      participants: {
        create: [
          ...members.map((item) => ({ type: BillParticipantType.MEMBER, userId: item.user.id, displayNameSnapshot: item.user.displayName || "圈友" })),
          ...guestNames.map((guestName) => ({ type: BillParticipantType.GUEST, guestName, displayNameSnapshot: guestName })),
        ],
      },
    },
    include: { participants: true },
  });
  await writeAuditEvent(prisma, { actorId: input.userId, circleId: membership.circleId, eventType: "BILL_CREATED", entityType: "Bill", entityId: bill.id });
  return bill;
}

export async function addExpense(input: { userId: string; slug: string; billId: string; title: string; payerParticipantId: string; amountAed: number; split: SplitInput }) {
  const { membership, bill } = await getCreatorBill(input.userId, input.slug, input.billId);
  if (bill.status === BillStatus.SETTLED) throw new BillServiceError("已结算账单请先重新开启后再编辑。");
  if (!bill.participants.some((participant) => participant.id === input.payerParticipantId)) throw new BillServiceError("付款人必须是账单参与者。");
  const amountFils = toFils(input.amountAed);
  if (!Number.isSafeInteger(amountFils) || amountFils <= 0) throw new BillServiceError("金额必须大于 0，且最多保留两位小数。");
  const participantIds = new Set(bill.participants.map((participant) => participant.id));
  const splitIds = input.split.method === "EQUAL" ? input.split.participantIds : input.split.method === "EXACT_AMOUNT" ? input.split.amounts.map((item) => item.participantId) : input.split.method === "PERCENTAGE" ? input.split.percentages.map((item) => item.participantId) : input.split.shares.map((item) => item.participantId);
  if (!splitIds.length || splitIds.some((id) => !participantIds.has(id))) throw new BillServiceError("分摊对象必须是账单参与者。");
  let splits;
  try { splits = calculateExpenseSplits(amountFils, input.split); } catch (error) { throw new BillServiceError(error instanceof Error ? error.message : "分摊计算失败。"); }
  const expense = await prisma.expense.create({
    data: {
      billId: bill.id,
      payerParticipantId: input.payerParticipantId,
      title: input.title,
      amountAed: fromFils(amountFils),
      splitMethod: input.split.method as SplitMethod,
      splits: {
        create: splits.map((item) => {
          const value = input.split.method === "PERCENTAGE" ? input.split.percentages.find((row) => row.participantId === item.participantId)?.basisPoints : undefined;
          const shares = input.split.method === "SHARES" ? input.split.shares.find((row) => row.participantId === item.participantId)?.shares : undefined;
          return { participantId: item.participantId, amountAed: fromFils(item.amountFils), inputPercentage: value === undefined ? null : new Prisma.Decimal(value).div(100), inputShares: shares ?? null };
        }),
      },
    },
  });
  await writeAuditEvent(prisma, { actorId: input.userId, circleId: membership.circleId, eventType: "BILL_EXPENSE_CREATED", entityType: "Expense", entityId: expense.id });
  return expense;
}

export async function settleBill(input: { userId: string; slug: string; billId: string; reopen?: boolean }) {
  const { membership, bill } = await getCreatorBill(input.userId, input.slug, input.billId);
  if (input.reopen) {
    await prisma.bill.update({ where: { id: bill.id }, data: { status: BillStatus.OPEN } });
    await writeAuditEvent(prisma, { actorId: input.userId, circleId: membership.circleId, eventType: "BILL_REOPENED", entityType: "Bill", entityId: bill.id });
    return;
  }
  const expenses = await prisma.expense.findMany({ where: { billId: bill.id }, include: { splits: true } });
  const calculated = calculateSettlement(expenses.map((expense) => {
    const amountFils = toFils(Number(expense.amountAed));
    const split = expense.splitMethod === "EQUAL" ? { method: "EXACT_AMOUNT" as const, amounts: expense.splits.map((row) => ({ participantId: row.participantId, amountFils: toFils(Number(row.amountAed)) })) }
      : expense.splitMethod === "EXACT_AMOUNT" ? { method: "EXACT_AMOUNT" as const, amounts: expense.splits.map((row) => ({ participantId: row.participantId, amountFils: toFils(Number(row.amountAed)) })) }
      : expense.splitMethod === "PERCENTAGE" ? { method: "PERCENTAGE" as const, percentages: expense.splits.map((row) => ({ participantId: row.participantId, basisPoints: Math.round(Number(row.inputPercentage) * 100) })) }
      : { method: "SHARES" as const, shares: expense.splits.map((row) => ({ participantId: row.participantId, shares: row.inputShares ?? 0 })) };
    return { id: expense.id, payerId: expense.payerParticipantId, amountFils, split };
  }));
  await prisma.$transaction(async (tx) => {
    await tx.settlementTransfer.updateMany({ where: { billId: bill.id, status: TransferStatus.PENDING }, data: { status: TransferStatus.SUPERSEDED } });
    if (calculated.settlements.length) await tx.settlementTransfer.createMany({ data: calculated.settlements.map((row) => ({ billId: bill.id, fromParticipantId: row.fromParticipantId, toParticipantId: row.toParticipantId, amountAed: fromFils(row.amountFils) })) });
    await tx.bill.update({ where: { id: bill.id }, data: { status: BillStatus.SETTLED } });
  });
  await writeAuditEvent(prisma, { actorId: input.userId, circleId: membership.circleId, eventType: "BILL_SETTLED", entityType: "Bill", entityId: bill.id });
}

export async function markTransferPaid(input: { userId: string; slug: string; billId: string; transferId: string }) {
  const membership = await requireActiveMembership(input.userId, input.slug);
  if (!membership) throw new BillServiceError("你不是该圈子的有效成员。");
  const transfer = await prisma.settlementTransfer.findFirst({ where: { id: input.transferId, billId: input.billId, bill: { circleId: membership.circleId } }, include: { fromParticipant: true } });
  if (!transfer || transfer.fromParticipant.userId !== input.userId) throw new BillServiceError("只有付款方本人可以标记已付款。");
  await prisma.settlementTransfer.update({ where: { id: transfer.id }, data: { status: TransferStatus.MARKED_PAID, markedPaidAt: new Date(), markedPaidById: input.userId } });
}
