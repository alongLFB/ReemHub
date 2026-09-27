import { DeliveryStatus, NotificationChannel } from "@prisma/client";
import { prisma } from "@/infrastructure/db/prisma";
import { decryptField, encryptField } from "@/shared/security/field-encryption";

export async function createNotification(input: { userId: string; type: string; title: string; body: string; targetUrl?: string; eventReminder?: boolean }) {
  const user = await prisma.user.findUnique({ where: { id: input.userId }, include: { notificationPreference: true, telegramChannel: true } });
  if (!user) return null;
  const sendEmail = !input.eventReminder || user.notificationPreference?.emailEventRemindersEnabled !== false;
  return prisma.notification.create({
    data: {
      userId: input.userId, type: input.type, title: input.title, body: input.body, targetUrl: input.targetUrl ?? null,
      deliveries: { create: [
        ...(sendEmail ? [{ channel: NotificationChannel.EMAIL, recipient: user.email }] : []),
        ...(user.telegramChannel?.enabledAt ? [{ channel: NotificationChannel.TELEGRAM, recipient: user.id }] : []),
      ] },
    },
  });
}

export async function updateNotificationPreferences(input: { userId: string; emailEventRemindersEnabled: boolean; telegramBotToken?: string; telegramChatId?: string; telegramEnabled?: boolean }) {
  await prisma.userNotificationPreference.upsert({ where: { userId: input.userId }, create: { userId: input.userId, emailEventRemindersEnabled: input.emailEventRemindersEnabled }, update: { emailEventRemindersEnabled: input.emailEventRemindersEnabled } });
  if (input.telegramBotToken && input.telegramChatId) {
    await prisma.telegramNotificationChannel.upsert({
      where: { userId: input.userId },
      create: { userId: input.userId, botTokenCiphertext: encryptField(input.telegramBotToken), chatId: input.telegramChatId, enabledAt: input.telegramEnabled === false ? null : new Date() },
      update: { botTokenCiphertext: encryptField(input.telegramBotToken), chatId: input.telegramChatId, enabledAt: input.telegramEnabled === false ? null : new Date() },
    });
  } else if (input.telegramEnabled === false) {
    await prisma.telegramNotificationChannel.updateMany({ where: { userId: input.userId }, data: { enabledAt: null } });
  }
}

export async function markNotificationRead(userId: string, id: string) {
  await prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
}

async function sendTelegram(userId: string, text: string) {
  const channel = await prisma.telegramNotificationChannel.findUnique({ where: { userId } });
  if (!channel?.enabledAt) throw new Error("Telegram channel is disabled");
  const response = await fetch(`https://api.telegram.org/bot${decryptField(channel.botTokenCiphertext)}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: channel.chatId, text }) });
  if (!response.ok) throw new Error(`Telegram returned ${response.status}`);
}

export async function deliverPendingNotifications(limit = 50) {
  const now = new Date();
  const deliveries = await prisma.notificationDelivery.findMany({ where: { status: { in: [DeliveryStatus.PENDING, DeliveryStatus.FAILED] }, nextAttemptAt: { lte: now } }, include: { notification: true }, orderBy: { nextAttemptAt: "asc" }, take: limit });
  for (const delivery of deliveries) {
    const claimed = await prisma.notificationDelivery.updateMany({ where: { id: delivery.id, status: { in: [DeliveryStatus.PENDING, DeliveryStatus.FAILED] } }, data: { status: DeliveryStatus.PROCESSING } });
    if (!claimed.count) continue;
    try {
      if (delivery.channel === NotificationChannel.EMAIL) {
        const { sendMail } = await import("./mail");
        await sendMail({ to: delivery.recipient, subject: delivery.notification.title, text: `${delivery.notification.body}${delivery.notification.targetUrl ? `\n\n${delivery.notification.targetUrl}` : ""}` });
      } else {
        await sendTelegram(delivery.recipient, `${delivery.notification.title}\n${delivery.notification.body}`);
      }
      await prisma.notificationDelivery.update({ where: { id: delivery.id }, data: { status: DeliveryStatus.SENT, sentAt: new Date(), lastError: null } });
    } catch (error) {
      const attempts = delivery.attempts + 1;
      const delayMinutes = Math.min(60, 2 ** Math.min(attempts, 6));
      await prisma.notificationDelivery.update({ where: { id: delivery.id }, data: { status: DeliveryStatus.FAILED, attempts, nextAttemptAt: new Date(Date.now() + delayMinutes * 60_000), lastError: error instanceof Error ? error.message.slice(0, 1000) : "Unknown delivery error" } });
    }
  }
}

export async function enqueueDueEventReminders(limit = 100) {
  const reminders = await prisma.eventReminder.findMany({ where: { sentAt: null, cancelledAt: null, scheduledAt: { lte: new Date() }, event: { status: "OPEN" } }, include: { event: { include: { registrations: { where: { status: "GOING" }, select: { userId: true } }, circle: { select: { slug: true } } } } }, take: limit, orderBy: { scheduledAt: "asc" } });
  for (const reminder of reminders) {
    const claimed = await prisma.eventReminder.updateMany({ where: { id: reminder.id, sentAt: null }, data: { sentAt: new Date() } });
    if (!claimed.count) continue;
    await Promise.all(reminder.event.registrations.map((registration) => createNotification({ userId: registration.userId, type: "EVENT_REMINDER", title: `活动提醒：${reminder.event.title}`, body: `活动将在 ${reminder.offsetMinutes} 分钟后开始。`, targetUrl: `/app/circles/${reminder.event.circle.slug}/events`, eventReminder: true })));
  }
}
