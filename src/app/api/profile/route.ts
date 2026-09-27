import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/infrastructure/db/prisma";
import { getCurrentUserId } from "@/modules/identity/current-user";
import { writeAuditEvent } from "@/modules/audit/write-audit-event";
import { encryptField } from "@/shared/security/field-encryption";

const schema = z.object({
  displayName: z.string().trim().min(1).max(120),
  building: z.string().trim().max(120).optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  bankName: z.string().trim().max(120).optional().or(z.literal("")),
  iban: z.string().trim().max(30).optional().or(z.literal("")),
  birthdayMonth: z.number().int().min(1).max(12).nullable(),
  birthdayDay: z.number().int().min(1).max(31).nullable(),
}).superRefine((value, ctx) => {
  if (value.iban) {
    const normalized = value.iban.replace(/\s/g, "").toUpperCase();
    if (!/^AE[A-Z0-9]{21}$/.test(normalized)) {
      ctx.addIssue({ code: "custom", path: ["iban"], message: "IBAN 必须以 AE 开头且为 23 位。" });
    }
  }
});

export async function PATCH(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "资料格式不正确。" }, { status: 400 });
  }

  const { phone, iban, ...rest } = parsed.data;
  const normalizedIban = iban ? iban.replace(/\s/g, "").toUpperCase() : "";
  await prisma.user.update({
    where: { id: userId },
    data: {
      ...rest,
      building: rest.building || null,
      bankName: rest.bankName || null,
      phoneCiphertext: phone ? encryptField(phone) : null,
      phoneLast4: phone ? phone.replace(/\D/g, "").slice(-4) : null,
      ibanCiphertext: normalizedIban ? encryptField(normalizedIban) : null,
      ibanLast4: normalizedIban ? normalizedIban.slice(-4) : null,
    },
  });
  await writeAuditEvent(prisma, {
    actorId: userId,
    eventType: "PROFILE_UPDATED",
    entityType: "User",
    entityId: userId,
  });
  return NextResponse.json({ ok: true });
}
