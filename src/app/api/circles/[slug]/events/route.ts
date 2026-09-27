import { NextResponse } from "next/server";
import { z } from "zod";
import { createEvent, EventServiceError } from "@/modules/event/event-service";
import { getCurrentUserId } from "@/modules/identity/current-user";

const schema = z.object({
  title: z.string().trim().min(1).max(180),
  eventTime: z.string().datetime(),
  locationName: z.string().trim().max(180).optional(),
  notes: z.string().trim().max(5000).optional(),
  restaurantId: z.string().uuid().optional(),
  maxParticipants: z.number().int().positive().max(10000).optional(),
  registrationDeadline: z.string().datetime().optional(),
  waitlistEnabled: z.boolean().default(false),
  reminderOffsets: z.array(z.number().int().positive().max(43200)).max(5).default([]),
});

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "活动资料格式不正确。" }, { status: 400 });
  try {
    const { slug } = await context.params;
    const event = await createEvent({
      userId,
      slug,
      ...parsed.data,
      eventTime: new Date(parsed.data.eventTime),
      registrationDeadline: parsed.data.registrationDeadline ? new Date(parsed.data.registrationDeadline) : undefined,
    });
    return NextResponse.json({ id: event.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof EventServiceError ? error.message : "活动创建失败。" }, { status: 400 });
  }
}
