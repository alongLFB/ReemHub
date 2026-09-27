import { EventRegistrationStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { adjustEventRoster, EventServiceError } from "@/modules/event/event-service";
import { getCurrentUserId } from "@/modules/identity/current-user";

const schema = z.object({ targetUserId: z.string().uuid(), status: z.nativeEnum(EventRegistrationStatus), reason: z.string().trim().max(1000).optional() });

export async function PATCH(request: Request, context: { params: Promise<{ slug: string; id: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "名单调整参数不正确。" }, { status: 400 });
  try {
    const { slug, id } = await context.params;
    await adjustEventRoster({ userId, slug, eventId: id, ...parsed.data });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof EventServiceError ? error.message : "名单调整失败。" }, { status: 400 });
  }
}
