import { randomUUID } from "node:crypto";
import type { Express, NextFunction, Request, Response } from "express";
import { DateTime } from "luxon";
import { z } from "zod";
import { SHOP_ZONE } from "./config.js";
import { overlaps, scheduleBounds, validDate } from "./booking.js";
import { ensure } from "./errors.js";
import type { Appointment, TimeBlock } from "./models.js";
import type { Repository } from "./repository.js";
import { createDueReminders, sendPush } from "./notifications.js";

const wrap = (handler: (req: Request, res: Response) => unknown | Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => { Promise.resolve().then(() => handler(req, res)).catch(next); };
const date = z.string().refine(validDate, "Ngày không hợp lệ.");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Giờ không hợp lệ.");
const active = (appointment: Appointment) => ["pending", "confirmed", "in_progress"].includes(appointment.status);
const shopDay = (appointment: Appointment) => DateTime.fromISO(appointment.startAt).setZone(SHOP_ZONE).toISODate()!;
const sum = (items: Appointment[], get: (item: Appointment) => number) => items.reduce((total, item) => total + get(item), 0);

export function registerAdminOperations(app: Express, repo: Repository) {
  app.get("/api/admin/support/messages", (_req, res) => {
    res.json(repo.supportMessages.all().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((item) => ({
      ...item, customerName: repo.users.get(item.customerId)?.name || "Khách hàng"
    })));
  });
  app.patch("/api/admin/support/messages/:id/reply", wrap((req, res) => {
    const item = repo.supportMessages.get(req.params.id);
    ensure(item, 404, "Không tìm thấy tin nhắn.");
    const { reply } = z.object({ reply: z.string().trim().min(2).max(500) }).parse(req.body);
    const updated = { ...item, reply, repliedAt: new Date().toISOString() };
    repo.supportMessages.put(updated);
    repo.notifications.put({ id: randomUUID(), customerId: item.customerId, title: "Salon đã trả lời", body: reply,
      kind: "manual", createdAt: new Date().toISOString(), read: false });
    res.json(updated);
  }));
  app.get("/api/admin/dashboard-live", wrap((_req, res) => {
    const now = DateTime.now().setZone(SHOP_ZONE);
    const today = now.toISODate()!;
    const todayItems = repo.appointments.all().filter((item) => shopDay(item) === today);
    const upcoming = repo.appointments.all().filter((item) => active(item) && DateTime.fromISO(item.startAt) > now)
      .sort((a, b) => a.startAt.localeCompare(b.startAt)).slice(0, 5);
    const stylistStatus = repo.barbers.all().filter((barber) => barber.active).map((barber) => {
      const busy = todayItems.find((item) => item.barberId === barber.id && active(item) &&
        DateTime.fromISO(item.startAt) <= now && (item.status === "in_progress" || DateTime.fromISO(item.endAt) > now));
      const onLeave = repo.leaves.all().some((leave) => leave.barberId === barber.id && leave.status === "approved" && today >= leave.from && today <= leave.to);
      const onShift = repo.schedules.all().some((schedule) => schedule.barberId === barber.id && schedule.date === today &&
        scheduleBounds(schedule).start <= now && scheduleBounds(schedule).end > now);
      const onBreak = repo.blocks.all().some((block) => block.barberId === barber.id && block.date === today &&
        scheduleBounds(block).start <= now && scheduleBounds(block).end > now);
      return { barberId: barber.id, name: barber.name, status: onLeave || !onShift || onBreak ? "off" : busy ? "busy" : "available", appointment: busy };
    });
    const cancelled = todayItems.filter((item) => item.status === "cancelled" || item.status === "no_show").length;
    res.json({
      todayTotal: todayItems.length,
      inService: todayItems.filter((item) => item.status === "in_progress").length,
      expectedRevenue: sum(todayItems.filter(active), (item) => item.priceSnapshot),
      paidRevenue: sum(todayItems.filter((item) => item.status === "completed"), (item) => item.amountPaid || 0),
      cancellationRate: todayItems.length ? Math.round(cancelled * 1000 / todayItems.length) / 10 : 0,
      upcoming,
      stylistStatus
    });
  }));

  app.get("/api/admin/reports", wrap((req, res) => {
    const query = z.object({ from: date, to: date }).parse(req.query);
    ensure(query.from <= query.to, 400, "Khoảng ngày không hợp lệ.");
    const period = repo.appointments.all().filter((item) => shopDay(item) >= query.from && shopDay(item) <= query.to);
    const completed = period.filter((item) => item.status === "completed");
    const byPayment = (["cash", "transfer", "card"] as const).map((method) => ({ method,
      total: sum(completed.filter((item) => item.paymentMethod === method), (item) => item.amountPaid || 0) }));
    const byService = repo.services.all().map((service) => {
      const items = completed.filter((item) => (item.serviceIds || [item.serviceId]).includes(service.id));
      return { serviceId: service.id, name: service.name, count: items.length,
        revenue: sum(items, (item) => {
          const entry = item.serviceItems?.find((part) => part.id === service.id);
          const base = item.serviceItems?.reduce((total, part) => total + part.price, 0) || 0;
          return entry && base ? Math.round(item.priceSnapshot * entry.price / base) : item.priceSnapshot;
        }) };
    }).sort((a, b) => b.revenue - a.revenue);
    const byBarber = repo.barbers.all().map((barber) => {
      const items = completed.filter((item) => item.barberId === barber.id);
      const revenue = sum(items, (item) => item.priceSnapshot);
      const rated = repo.appointments.all().filter((item) => item.barberId === barber.id && item.rating);
      return { barberId: barber.id, name: barber.name, count: items.length, revenue, commission: Math.round(revenue * (barber.commissionRate || 0) / 100), ratingAverage: rated.length ? Math.round(sum(rated, (item) => item.rating || 0) * 10 / rated.length) / 10 : null };
    }).sort((a, b) => b.revenue - a.revenue);
    const peakHours = Array.from({ length: 13 }, (_, index) => {
      const hour = index + 8;
      return { hour, count: period.filter((item) => DateTime.fromISO(item.startAt).setZone(SHOP_ZONE).hour === hour).length };
    });
    const customers = new Set(completed.filter((item) => !item.walkIn).map((item) => item.customerId));
    const allCompleted = repo.appointments.all().filter((item) => item.status === "completed");
    const repeat = [...customers].filter((id) => allCompleted.filter((item) => item.customerId === id).length > 1).length;
    res.json({ from: query.from, to: query.to,
      completedRevenue: sum(completed, (item) => item.priceSnapshot),
      paidRevenue: sum(completed, (item) => item.amountPaid || 0),
      expectedRevenue: sum(period.filter(active), (item) => item.priceSnapshot),
      byPayment, byService, byBarber, peakHours,
      retentionRate: customers.size ? Math.round(repeat * 1000 / customers.size) / 10 : 0
    });
  }));

  const blockSchema = z.object({ barberId: z.string().min(1), date, startTime: time, endTime: time, reason: z.string().trim().min(2).max(200) });
  app.get("/api/admin/blocks", wrap((req, res) => {
    const query = z.object({ date: date.optional(), barberId: z.string().optional() }).parse(req.query);
    res.json(repo.blocks.all().filter((block) => (!query.date || block.date === query.date) && (!query.barberId || block.barberId === query.barberId)));
  }));
  app.post("/api/admin/blocks", wrap((req, res) => {
    const body = blockSchema.parse(req.body);
    ensure(repo.barbers.get(body.barberId), 404, "Không tìm thấy thợ.");
    const block: TimeBlock = { id: randomUUID(), ...body };
    const bounds = scheduleBounds(block);
    ensure(bounds.start < bounds.end, 400, "Giờ kết thúc phải sau giờ bắt đầu.");
    ensure(!repo.blocks.all().some((other) => {
      if (other.barberId !== block.barberId || other.date !== block.date) return false;
      const b = scheduleBounds(other);
      return overlaps(bounds.start.toMillis(), bounds.end.toMillis(), b.start.toMillis(), b.end.toMillis());
    }), 409, "Khung giờ này đã bị chặn.");
    ensure(!repo.appointments.all().some((item) => item.barberId === block.barberId && active(item) &&
      overlaps(bounds.start.toMillis(), bounds.end.toMillis(), DateTime.fromISO(item.startAt).toMillis(), DateTime.fromISO(item.endAt).toMillis())),
    409, "Cần đổi các lịch hẹn đang hiệu lực trước khi chặn giờ.");
    repo.blocks.put(block);
    res.status(201).json(block);
  }));
  app.delete("/api/admin/blocks/:id", wrap((req, res) => {
    ensure(repo.blocks.get(req.params.id), 404, "Không tìm thấy giờ chặn.");
    repo.blocks.remove(req.params.id); res.status(204).end();
  }));

  const leaveSchema = z.object({ barberId: z.string().min(1), from: date, to: date, reason: z.string().trim().min(2).max(300) });
  app.get("/api/admin/leaves", (_req, res) => { res.json(repo.leaves.all()); });
  app.post("/api/admin/leaves", wrap((req, res) => {
    const body = leaveSchema.parse(req.body);
    ensure(repo.barbers.get(body.barberId), 404, "Không tìm thấy thợ.");
    ensure(body.from <= body.to, 400, "Khoảng ngày không hợp lệ.");
    const leave = { id: randomUUID(), ...body, status: "pending" as const };
    repo.leaves.put(leave); res.status(201).json(leave);
  }));
  app.patch("/api/admin/leaves/:id", wrap((req, res) => {
    const leave = repo.leaves.get(req.params.id);
    ensure(leave, 404, "Không tìm thấy đơn nghỉ.");
    const { status } = z.object({ status: z.enum(["approved", "rejected"]) }).parse(req.body);
    if (status === "approved") ensure(!repo.appointments.all().some((item) => item.barberId === leave.barberId && active(item) && shopDay(item) >= leave.from && shopDay(item) <= leave.to),
      409, "Cần đổi các lịch hẹn đang hiệu lực trước khi duyệt nghỉ.");
    const updated = { ...leave, status }; repo.leaves.put(updated); res.json(updated);
  }));

  const weeklySchema = z.object({ barberId: z.string().min(1), weekday: z.number().int().min(1).max(7), startTime: time, endTime: time, from: date, to: date });
  app.get("/api/admin/weekly-shifts", (_req, res) => { res.json(repo.weeklyShifts.all()); });
  app.post("/api/admin/weekly-shifts", wrap((req, res) => {
    const body = weeklySchema.parse(req.body);
    ensure(repo.barbers.get(body.barberId), 404, "Không tìm thấy thợ.");
    const from = DateTime.fromISO(body.from, { zone: SHOP_ZONE });
    const to = DateTime.fromISO(body.to, { zone: SHOP_ZONE });
    ensure(to >= from && to.diff(from, "days").days <= 90 && body.startTime < body.endTime, 400, "Ca lặp tối đa 90 ngày, giờ kết thúc phải sau giờ bắt đầu.");
    const generated = [];
    for (let day = from; day <= to; day = day.plus({ days: 1 })) {
      if (day.weekday !== body.weekday) continue;
      const schedule = { id: randomUUID(), barberId: body.barberId, date: day.toISODate()!, startTime: body.startTime, endTime: body.endTime, sourceWeeklyId: "" };
      const bounds = scheduleBounds(schedule);
      ensure(!repo.schedules.all().some((other) => {
        if (other.barberId !== schedule.barberId || other.date !== schedule.date) return false;
        const b = scheduleBounds(other);
        return overlaps(bounds.start.toMillis(), bounds.end.toMillis(), b.start.toMillis(), b.end.toMillis());
      }), 409, `Ca ${schedule.date} bị chồng lấn.`);
      generated.push(schedule);
    }
    const rule = { id: randomUUID(), ...body };
    repo.weeklyShifts.put(rule);
    for (const schedule of generated) repo.schedules.put({ ...schedule, sourceWeeklyId: rule.id });
    res.status(201).json({ ...rule, generatedCount: generated.length });
  }));
  app.delete("/api/admin/weekly-shifts/:id", wrap((req, res) => {
    ensure(repo.weeklyShifts.get(req.params.id), 404, "Không tìm thấy ca lặp.");
    const generated = repo.schedules.all().filter((item) => item.sourceWeeklyId === req.params.id);
    ensure(!repo.appointments.all().some((item) => active(item) && generated.some((shift) => shift.barberId === item.barberId && shift.date === shopDay(item))), 409, "Ca lặp đã có lịch hẹn; hãy xử lý lịch trước khi xóa.");
    for (const shift of generated) repo.schedules.remove(shift.id);
    repo.weeklyShifts.remove(req.params.id); res.status(204).end();
  }));

  const voucherSchema = z.object({ code: z.string().trim().min(3).max(30).regex(/^[A-Za-z0-9_-]+$/), kind: z.enum(["percent", "fixed"]), value: z.number().int().min(1), maxUses: z.number().int().min(1), from: date, to: date, startTime: time.nullable().optional(), endTime: time.nullable().optional(), active: z.boolean() });
  app.get("/api/admin/vouchers", (_req, res) => { res.json(repo.vouchers.all()); });
  app.post("/api/admin/vouchers", wrap((req, res) => {
    const body = voucherSchema.parse(req.body);
    const code = body.code.toUpperCase();
    ensure(!repo.vouchers.all().some((item) => item.code === code), 409, "Mã đã tồn tại.");
    ensure(body.from <= body.to && (!body.startTime || !body.endTime || body.startTime < body.endTime) && (body.kind !== "percent" || body.value <= 100), 400, "Giá trị hoặc thời gian mã không hợp lệ.");
    const voucher = { id: randomUUID(), ...body, code, usedCount: 0 };
    repo.vouchers.put(voucher); res.status(201).json(voucher);
  }));
  app.patch("/api/admin/vouchers/:id", wrap((req, res) => {
    const existing = repo.vouchers.get(req.params.id);
    ensure(existing, 404, "Không tìm thấy mã.");
    const body = voucherSchema.parse({ ...existing, ...req.body });
    const code = body.code.toUpperCase();
    ensure(!repo.vouchers.all().some((item) => item.id !== existing.id && item.code === code), 409, "Mã đã tồn tại.");
    ensure(body.maxUses >= existing.usedCount && body.from <= body.to &&
      (!body.startTime || !body.endTime || body.startTime < body.endTime) &&
      (body.kind !== "percent" || body.value <= 100), 400, "Giá trị mã không hợp lệ.");
    const voucher = { ...existing, ...body, code };
    repo.vouchers.put(voucher); res.json(voucher);
  }));
  app.delete("/api/admin/vouchers/:id", wrap((req, res) => {
    const voucher = repo.vouchers.get(req.params.id);
    ensure(voucher, 404, "Không tìm thấy mã.");
    ensure(!repo.appointments.all().some((item) => item.voucherCode === voucher.code && active(item)),
      409, "Mã đang áp dụng cho lịch hẹn; hãy xử lý các lịch trước khi xóa.");
    repo.vouchers.remove(req.params.id); res.status(204).end();
  }));

  app.get("/api/admin/notifications", (_req, res) => { res.json(repo.notifications.all().sort((a, b) => b.createdAt.localeCompare(a.createdAt))); });
  app.post("/api/admin/notifications", wrap(async (req, res) => {
    const body = z.object({ customerId: z.string().optional(), title: z.string().trim().min(2).max(100), body: z.string().trim().min(2).max(500) }).parse(req.body);
    const customers = body.customerId ? repo.users.all().filter((user) => user.id === body.customerId && user.role === "customer") : repo.users.all().filter((user) => user.role === "customer");
    ensure(customers.length > 0, 404, "Không tìm thấy khách hàng.");
    const notices = customers.map((customer) => ({ id: randomUUID(), customerId: customer.id, title: body.title, body: body.body, kind: "manual" as const, createdAt: new Date().toISOString(), read: false }));
    for (const notice of notices) repo.notifications.put(notice);
    const push = await sendPush(repo, notices);
    res.status(201).json({ sentCount: customers.length, delivery: "in_app", push });
  }));
  const pushTokenSchema = z.object({ token: z.string().max(200).regex(/^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$/) });
  app.post("/api/push-tokens", wrap((req, res) => {
    ensure(res.locals.user.role === "customer", 403, "Chỉ khách hàng đăng ký thiết bị nhận tin.");
    const { token } = pushTokenSchema.parse(req.body);
    for (const device of repo.pushDevices.all().filter((item) => item.token === token)) repo.pushDevices.remove(device.id);
    const device = { id: randomUUID(), customerId: res.locals.user.id, token };
    repo.pushDevices.put(device); res.status(201).json({ registered: true });
  }));
  app.delete("/api/push-tokens", wrap((req, res) => {
    const { token } = pushTokenSchema.parse(req.body);
    for (const device of repo.pushDevices.all().filter((item) => item.token === token && item.customerId === res.locals.user.id)) repo.pushDevices.remove(device.id);
    res.status(204).end();
  }));
  app.get("/api/notifications/me", (_req, res) => {
    const userId = res.locals.user.id;
    const due = createDueReminders(repo);
    if (due.length) void sendPush(repo, due);
    res.json(repo.notifications.all().filter((item) => item.customerId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  });
  app.patch("/api/notifications/:id/read", wrap((req, res) => {
    const notice = repo.notifications.get(req.params.id);
    ensure(notice && notice.customerId === res.locals.user.id, 404, "Không tìm thấy thông báo.");
    const updated = { ...notice, read: true }; repo.notifications.put(updated); res.json(updated);
  }));
}
