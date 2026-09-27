import { NextResponse } from "next/server";
import { z } from "zod";
import { createBill, BillServiceError } from "@/modules/bill/bill-service";
import { getCurrentUserId } from "@/modules/identity/current-user";
import { requireActiveMembership } from "@/modules/circle/circle-access";
import { prisma } from "@/infrastructure/db/prisma";

const schema = z.object({ title: z.string().trim().min(1).max(180), eventId: z.string().uuid().optional(), memberIds: z.array(z.string().uuid()).max(500).default([]), guestNames: z.array(z.string().trim().min(1).max(120)).max(100).default([]) });

export async function GET(_: Request, context: { params: Promise<{ slug: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const { slug } = await context.params;
  const membership = await requireActiveMembership(userId, slug);
  if (!membership) return NextResponse.json({ error: "没有访问权限。" }, { status: 403 });
  const bills = await prisma.bill.findMany({ where: { circleId: membership.circleId }, include: { creator: { select: { displayName: true } }, participants: true, expenses: true, transfers: { where: { status: { not: "SUPERSEDED" } } } }, orderBy: { updatedAt: "desc" } });
  return NextResponse.json(bills.map((bill) => ({ id: bill.id, title: bill.title, status: bill.status, creatorName: bill.creator.displayName || "圈友", creatorId: bill.creatorId, participantCount: bill.participants.length, expenseTotalAed: bill.expenses.reduce((sum, expense) => sum + Number(expense.amountAed), 0), transferCount: bill.transfers.length })));
}

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "账单资料格式不正确。" }, { status: 400 });
  try {
    const { slug } = await context.params;
    const bill = await createBill({ userId, slug, ...parsed.data });
    return NextResponse.json({ id: bill.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof BillServiceError ? error.message : "创建账单失败。" }, { status: 400 });
  }
}
