import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/infrastructure/db/prisma";
import { issueRegistrationCode } from "@/modules/identity/verification";
import { sendMail } from "@/modules/notification/mail";
import { clientAddress, consumeRateLimit } from "@/shared/security/rate-limit";

const schema = z.object({
  displayName: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(10).max(256),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "请输入有效的称呼、邮箱和至少 10 位密码。" }, { status: 400 });
  }

  const limit = consumeRateLimit(
    ["registration:", clientAddress(request.headers), ":", parsed.data.email].join(""),
    5,
    15 * 60 * 1000,
  );
  if (!limit.allowed) {
    return NextResponse.json({ error: "请求过于频繁，请稍后再试。" }, { status: 429 });
  }

  const existing = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: "该邮箱已注册，请直接登录。" }, { status: 409 });
  }

  try {
    const issued = await issueRegistrationCode(parsed.data);
    await sendMail({
      to: parsed.data.email,
      subject: "UAEHub 注册验证码",
      text: "你的 UAEHub 注册验证码是 " + issued.code + "，10 分钟内有效。请勿将验证码发送给其他人。",
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "验证码邮件暂时无法发送，请稍后重试。" }, { status: 503 });
  }
}
