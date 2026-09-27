import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/modules/identity/current-user";
import { markNotificationRead } from "@/modules/notification/notification-service";
export async function PATCH(_: Request, context: { params: Promise<{ id: string }> }) { const userId = await getCurrentUserId(); if (!userId) return NextResponse.json({ error: "请先登录。" }, { status: 401 }); const { id } = await context.params; await markNotificationRead(userId, id); return NextResponse.json({ ok: true }); }
