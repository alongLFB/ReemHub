import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserId } from "@/modules/identity/current-user";
import { updateNotificationPreferences } from "@/modules/notification/notification-service";
import { prisma } from "@/infrastructure/db/prisma";

const schema = z.object({ emailEventRemindersEnabled: z.boolean(), telegramBotToken: z.string().min(20).max(200).optional(), telegramChatId: z.string().min(1).max(80).optional(), telegramEnabled: z.boolean().optional() });
export async function GET() { const userId = await getCurrentUserId(); if (!userId) return NextResponse.json({ error: "请先登录。" }, { status: 401 }); const data = await prisma.user.findUnique({ where: { id: userId }, include: { notificationPreference: true, telegramChannel: true } }); return NextResponse.json({ emailEventRemindersEnabled: data?.notificationPreference?.emailEventRemindersEnabled ?? true, telegramConfigured: Boolean(data?.telegramChannel), telegramEnabled: Boolean(data?.telegramChannel?.enabledAt), telegramChatId: data?.telegramChannel?.chatId ?? "" }); }
export async function PUT(request: Request) { const userId = await getCurrentUserId(); if (!userId) return NextResponse.json({ error: "请先登录。" }, { status: 401 }); const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "通知设置格式不正确。" }, { status: 400 }); await updateNotificationPreferences({ userId, ...parsed.data }); return NextResponse.json({ ok: true }); }
