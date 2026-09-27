import { NextResponse } from "next/server";
import { cancelEventRegistration, EventServiceError, registerForEvent } from "@/modules/event/event-service";
import { getCurrentUserId } from "@/modules/identity/current-user";

export async function POST(_: Request, context: { params: Promise<{ slug: string; id: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  try {
    const { slug, id } = await context.params;
    const status = await registerForEvent({ userId, slug, eventId: id });
    return NextResponse.json({ ok: true, status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof EventServiceError ? error.message : "报名失败。" }, { status: 400 });
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ slug: string; id: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  try {
    const { slug, id } = await context.params;
    await cancelEventRegistration({ userId, slug, eventId: id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof EventServiceError ? error.message : "取消失败。" }, { status: 400 });
  }
}
