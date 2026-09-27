import { NextResponse } from "next/server";
import { ProfileField } from "@prisma/client";
import { z } from "zod";
import { requireActiveMembership } from "@/modules/circle/circle-access";
import { getCurrentUserId } from "@/modules/identity/current-user";
import { prisma } from "@/infrastructure/db/prisma";
import { writeAuditEvent } from "@/modules/audit/write-audit-event";

const schema = z.object({
  visibleFields: z.array(z.nativeEnum(ProfileField)),
});

export async function PUT(request: Request, context: { params: Promise<{ slug: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const { slug } = await context.params;
  const membership = await requireActiveMembership(userId, slug);
  if (!membership) return NextResponse.json({ error: "你不是该圈子的有效成员。" }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "资料字段不正确。" }, { status: 400 });
  const visible = new Set(parsed.data.visibleFields);

  await prisma.$transaction(async (tx) => {
    for (const field of Object.values(ProfileField)) {
      await tx.membershipProfileVisibility.upsert({
        where: { membershipId_field: { membershipId: membership.id, field } },
        create: { membershipId: membership.id, field, isVisible: visible.has(field) },
        update: { isVisible: visible.has(field) },
      });
    }
    await writeAuditEvent(tx, {
      actorId: userId,
      circleId: membership.circleId,
      eventType: "PROFILE_VISIBILITY_UPDATED",
      entityType: "CircleMembership",
      entityId: membership.id,
      metadata: { fields: parsed.data.visibleFields },
    });
  });

  return NextResponse.json({ ok: true });
}
