import { NextResponse } from "next/server";
import { applyWithInvitation, CircleServiceError } from "@/modules/circle/circle-service";
import { getCurrentUserId } from "@/modules/identity/current-user";

export async function POST(_: Request, context: { params: Promise<{ token: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "请先登录后再申请加入。" }, { status: 401 });
  try {
    const { token } = await context.params;
    return NextResponse.json({ ok: true, ...(await applyWithInvitation({ userId, token })) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof CircleServiceError ? error.message : "提交申请失败。" }, { status: 400 });
  }
}
