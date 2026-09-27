import { InvitationType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { CircleServiceError, createInvitation } from "@/modules/circle/circle-service";
import { getCurrentUserId } from "@/modules/identity/current-user";

const schema = z.object({
  type: z.nativeEnum(InvitationType).default(InvitationType.LINK),
  expiresAt: z.string().datetime().optional(),
  maxUses: z.number().int().positive().max(10000).optional(),
});

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "邀请参数不正确。" }, { status: 400 });
  try {
    const { slug } = await context.params;
    const invitation = await createInvitation({ userId, slug, ...parsed.data, expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined });
    return NextResponse.json({ ...invitation, url: new URL("/invite/" + invitation.token, request.url).toString() }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof CircleServiceError ? error.message : "创建邀请失败。" }, { status: 400 });
  }
}
