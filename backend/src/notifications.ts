import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { SHOP_ZONE } from "./config.js";
import type { Notification } from "./models.js";
import type { Repository } from "./repository.js";

export function createDueReminders(repo: Repository): Notification[] {
  const now = DateTime.now();
  const created: Notification[] = [];
  for (const appointment of repo.appointments.all()) {
    if (!["pending", "confirmed"].includes(appointment.status) || appointment.walkIn) continue;
    const hours = DateTime.fromISO(appointment.startAt).diff(now, "hours").hours;
    if (hours <= 0 || hours > 2) continue;
    const stage = hours <= 0.5 ? "thirty_minutes" : "two_hours";
    if (repo.notifications.all().some((item) => item.kind === "reminder" && item.appointmentId === appointment.id && item.stage === stage)) continue;
    const notice: Notification = {
      id: randomUUID(), customerId: appointment.customerId, title: stage === "thirty_minutes" ? "Còn 30 phút đến giờ hẹn" : "Còn khoảng 2 giờ đến giờ hẹn",
      body: `Lịch ${appointment.serviceNameSnapshot} lúc ${DateTime.fromISO(appointment.startAt).setZone(SHOP_ZONE).toFormat("HH:mm")}.`,
      kind: "reminder", stage, appointmentId: appointment.id, createdAt: new Date().toISOString(), read: false
    };
    repo.notifications.put(notice);
    created.push(notice);
  }
  for (const user of repo.users.all().filter((item) => item.role === "customer")) {
    if (user.birthday && DateTime.fromISO(user.birthday, { zone: SHOP_ZONE }).toFormat("MM-dd") === now.setZone(SHOP_ZONE).toFormat("MM-dd") &&
      !repo.notifications.all().some((item) => item.customerId === user.id && item.kind === "birthday" && DateTime.fromISO(item.createdAt).setZone(SHOP_ZONE).year === now.setZone(SHOP_ZONE).year)) {
      const today = now.setZone(SHOP_ZONE);
      const voucher = { id: randomUUID(), code: `SNHAT${today.toFormat("yy")}${user.id.slice(-4).toUpperCase()}`,
        kind: "percent" as const, value: 10, maxUses: 1, usedCount: 0,
        from: today.toISODate()!, to: today.plus({ days: 14 }).toISODate()!, active: true, ownerId: user.id };
      repo.vouchers.put(voucher);
      const notice: Notification = { id: randomUUID(), customerId: user.id, title: "Chúc mừng sinh nhật!",
        body: `Tặng bạn mã ${voucher.code} giảm 10%, dùng trong 14 ngày.`, kind: "birthday",
        createdAt: new Date().toISOString(), read: false };
      repo.notifications.put(notice); created.push(notice);
    }
    const last = repo.appointments.all().filter((item) => item.customerId === user.id && item.status === "completed")
      .sort((a, b) => b.endAt.localeCompare(a.endAt))[0];
    if (!last || now.diff(DateTime.fromISO(last.endAt), "days").days < 21 ||
      repo.appointments.all().some((item) => item.customerId === user.id && ["pending", "confirmed"].includes(item.status) && DateTime.fromISO(item.startAt) > now) ||
      repo.notifications.all().some((item) => item.kind === "care" && item.appointmentId === last.id)) continue;
    const notice: Notification = { id: randomUUID(), customerId: user.id, title: "Đến lúc chăm sóc mái tóc?",
      body: "Đã 3 tuần từ lần ghé tiệm gần nhất. Đặt lịch mới khi bạn cần làm mới kiểu tóc nhé!",
      kind: "care", appointmentId: last.id, createdAt: new Date().toISOString(), read: false };
    repo.notifications.put(notice); created.push(notice);
  }
  return created;
}

export async function sendPush(repo: Repository, notices: Notification[]): Promise<{ attempted: number; accepted: number }> {
  const messages = notices.flatMap((notice) => repo.pushDevices.all().filter((device) => device.customerId === notice.customerId)
    .map((device) => ({ device, to: device.token, title: notice.title, body: notice.body, sound: "default", data: { notificationId: notice.id, appointmentId: notice.appointmentId } })));
  let accepted = 0;
  for (let index = 0; index < messages.length; index += 100) {
    const batch = messages.slice(index, index + 100);
    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(batch.map(({ to, title, body, sound, data }) => ({ to, title, body, sound, data }))),
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) continue;
      const result = await response.json() as { data?: { status: string; details?: { error?: string } }[] };
      for (let offset = 0; offset < batch.length; offset += 1) {
        const ticket = result.data?.[offset];
        if (ticket?.status === "ok") accepted += 1;
        if (ticket?.details?.error === "DeviceNotRegistered") repo.pushDevices.remove(batch[offset].device.id);
      }
    } catch {
      // Thông báo trong app vẫn được giữ khi dịch vụ push tạm thời không truy cập được.
    }
  }
  await repo.flush?.();
  return { attempted: messages.length, accepted };
}

export function startReminderWorker(repo: Repository) {
  const tick = () => {
    const due = createDueReminders(repo);
    if (due.length) void sendPush(repo, due);
    void repo.flush?.().catch(() => console.error("Supabase reminder persistence failed."));
  };
  tick();
  const timer = setInterval(tick, 60000);
  timer.unref();
  return () => clearInterval(timer);
}
