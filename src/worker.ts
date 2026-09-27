import "dotenv/config";
import { getServerEnv } from "@/config/env";
import { deliverPendingNotifications, enqueueDueEventReminders } from "@/modules/notification/notification-service";

const env = getServerEnv();
async function tick() {
  await enqueueDueEventReminders();
  await deliverPendingNotifications();
}
void tick();
setInterval(() => { void tick(); }, env.WORKER_POLL_INTERVAL_MS);
