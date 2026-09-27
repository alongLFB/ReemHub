import { NextResponse } from "next/server";
import { z } from "zod";
import { consumeRegistrationCode } from "@/modules/identity/verification";
import { writeAuditEvent } from "@/modules/audit/write-audit-event";
import { prisma } from "@/infrastructure/db/prisma";

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: z.string().regex(/^\d{6}$/),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "请输入邮箱和 6 位验证码。" }, { status: 400 });
  }

  try {
    const user = await consumeRegistrationCode(parsed.data);
    if (!user) {
      return NextResponse.json({ error: "验证码无效或已过期。" }, { status: 400 });
    }

    await writeAuditEvent(prisma, {
      actorId: user.id,
      eventType: "REGISTRATION_COMPLETED",
      entityType: "User",
      entityId: user.id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "EMAIL_ALREADY_REGISTERED") {
      return NextResponse.json({ error: "该邮箱已注册，请直接登录。" }, { status: 409 });
    }
    return NextResponse.json({ error: "注册暂时无法完成，请稍后重试。" }, { status: 500 });
  }
}
