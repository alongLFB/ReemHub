import { NextResponse } from "next/server";
import { applyToPublicCircle, CircleServiceError } from "@/modules/circle/circle-service";
import { getCurrentUserId } from "@/modules/identity/current-user";

export async function POST(_: Request, context: { params: Promise<{ slug: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }

  try {
    const { slug } = await context.params;
    const result = await applyToPublicCircle({ userId, slug });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof CircleServiceError ? error.message : "申请暂时无法提交。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
