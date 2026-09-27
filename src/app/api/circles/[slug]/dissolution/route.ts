import { DissolutionMode } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { CircleServiceError, dissolveCircle, restoreCircle } from "@/modules/circle/circle-service";
import { getCurrentUserId } from "@/modules/identity/current-user";

const schema = z.object({ mode: z.nativeEnum(DissolutionMode) });

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "解散方式不正确。" }, { status: 400 });
  try {
    const { slug } = await context.params;
    await dissolveCircle({ userId, slug, mode: parsed.data.mode });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof CircleServiceError ? error.message : "解散失败。" }, { status: 400 });
  }
}

export async function PATCH(_: Request, context: { params: Promise<{ slug: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  try {
    const { slug } = await context.params;
    await restoreCircle({ userId, slug });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof CircleServiceError ? error.message : "恢复失败。" }, { status: 400 });
  }
}
