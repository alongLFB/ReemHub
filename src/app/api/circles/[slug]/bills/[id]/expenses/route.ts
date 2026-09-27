import { NextResponse } from "next/server";
import { z } from "zod";
import { addExpense, BillServiceError } from "@/modules/bill/bill-service";
import { getCurrentUserId } from "@/modules/identity/current-user";

const splitSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("EQUAL"), participantIds: z.array(z.string().uuid()).min(1) }),
  z.object({ method: z.literal("EXACT_AMOUNT"), amounts: z.array(z.object({ participantId: z.string().uuid(), amountFils: z.number().int().nonnegative() })).min(1) }),
  z.object({ method: z.literal("PERCENTAGE"), percentages: z.array(z.object({ participantId: z.string().uuid(), basisPoints: z.number().int().positive() })).min(1) }),
  z.object({ method: z.literal("SHARES"), shares: z.array(z.object({ participantId: z.string().uuid(), shares: z.number().int().positive() })).min(1) }),
]);
const schema = z.object({ title: z.string().trim().min(1).max(180), payerParticipantId: z.string().uuid(), amountAed: z.number().positive().max(1000000), split: splitSchema });

export async function POST(request: Request, context: { params: Promise<{ slug: string; id: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "支出及分摊资料格式不正确。" }, { status: 400 });
  try {
    const { slug, id } = await context.params;
    const expense = await addExpense({ userId, slug, billId: id, ...parsed.data });
    return NextResponse.json({ id: expense.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof BillServiceError ? error.message : "新增支出失败。" }, { status: 400 });
  }
}
