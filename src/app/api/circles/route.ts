import { NextResponse } from "next/server";
import { CircleVisibility } from "@prisma/client";
import { z } from "zod";
import { getCurrentUserId } from "@/modules/identity/current-user";
import { createCircle } from "@/modules/circle/circle-service";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional(),
  visibility: z.nativeEnum(CircleVisibility),
  tags: z.array(z.string().trim().min(1).max(30)).max(5).default([]),
});

export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "请检查圈子名称、可见性和标签。" }, { status: 400 });
  }

  const circle = await createCircle({ userId, ...parsed.data });
  return NextResponse.json({ id: circle.id, slug: circle.slug }, { status: 201 });
}
