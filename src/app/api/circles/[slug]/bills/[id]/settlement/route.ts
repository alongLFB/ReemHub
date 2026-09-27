import { NextResponse } from "next/server";
import { z } from "zod";
import { BillServiceError, markTransferPaid, settleBill } from "@/modules/bill/bill-service";
import { getCurrentUserId } from "@/modules/identity/current-user";

const schema = z.object({ action: z.enum(["SETTLE", "REOPEN", "MARK_PAID"]), transferId: z.string().uuid().optional() });

export async function POST(request: Request, context: { params: Promise<{ slug: string; id: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || (parsed.data.action === "MARK_PAID" && !parsed.data.transferId)) return NextResponse.json({ error: "结算操作参数不正确。" }, { status: 400 });
  try {
    const { slug, id } = await context.params;
    if (parsed.data.action === "MARK_PAID") await markTransferPaid({ userId, slug, billId: id, transferId: parsed.data.transferId! });
    else await settleBill({ userId, slug, billId: id, reopen: parsed.data.action === "REOPEN" });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof BillServiceError ? error.message : "结算操作失败。" }, { status: 400 });
  }
}
