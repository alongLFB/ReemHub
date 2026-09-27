import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { CircleServiceError, setMembershipRole, transferCircleOwnership } from "@/modules/circle/circle-service";
import { getCurrentUserId } from "@/modules/identity/current-user";

const schema = z.object({ action: z.enum(["SET_ROLE", "TRANSFER_OWNERSHIP"]), role: z.enum([MembershipRole.ADMIN, MembershipRole.MEMBER]).optional() });

export async function PATCH(request: Request, context: { params: Promise<{ slug: string; userId: string }> }) {
  const actorId = await getCurrentUserId();
  if (!actorId) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || (parsed.data.action === "SET_ROLE" && !parsed.data.role)) return NextResponse.json({ error: "成员调整参数不正确。" }, { status: 400 });
  try {
    const { slug, userId } = await context.params;
    if (parsed.data.action === "TRANSFER_OWNERSHIP") await transferCircleOwnership({ userId: actorId, slug, targetUserId: userId });
    else await setMembershipRole({ userId: actorId, slug, targetUserId: userId, role: parsed.data.role! });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof CircleServiceError ? error.message : "成员调整失败。" }, { status: 400 });
  }
}
