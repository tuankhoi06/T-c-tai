import { randomUUID } from "node:crypto";
import type { Express, NextFunction, Request, Response } from "express";
import { DateTime } from "luxon";
import { z } from "zod";
import { SHOP_ZONE } from "./config.js";
import { appointmentCommission, BookingService, isAppointmentPaymentConfirmed, overlaps, scheduleBounds, validDate } from "./booking.js";
import { ensure } from "./errors.js";
import type { Appointment, TimeBlock, User } from "./models.js";
import type { Repository } from "./repository.js";
import { createDueReminders, sendPush } from "./notifications.js";
import { appendSupportEntry, canSeeSupportThread, makeSupportThread, supportEntries, supportThreadView } from "./support.js";

const wrap = (handler: (req: Request, res: Response) => unknown | Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => { Promise.resolve().then(() => handler(req, res)).catch(next); };
const date = z.string().refine(validDate, "Ngày không hợp lệ.");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Giờ không hợp lệ.");
const active = (appointment: Appointment) => ["pending", "confirmed", "in_progress"].includes(appointment.status);
const shopDay = (appointment: Appointment) => DateTime.fromISO(appointment.startAt).setZone(SHOP_ZONE).toISODate()!;
const sum = (items: Appointment[], get: (item: Appointment) => number) => items.reduce((total, item) => total + get(item), 0);

export function registerAdminOperations(app: Express, repo: Repository) {
  const leaveImpact = (leave: { barberId: string; from: string; to: string }) => ({
    leaveBarberName: repo.barbers.get(leave.barberId)?.name || "Thợ",
    leaveShifts: repo.schedules.all().filter((item) => item.barberId === leave.barberId && item.date >= leave.from && item.date <= leave.to)
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
      .map(({ id, date, startTime, endTime }) => ({ id, date, startTime, endTime })),
    leaveAppointments: repo.appointments.all().filter((item) => item.barberId === leave.barberId && active(item) && shopDay(item) >= leave.from && shopDay(item) <= leave.to)
      .sort((a, b) => a.startAt.localeCompare(b.startAt))
      .map(({ id, customerId, customerNameSnapshot, serviceNameSnapshot, startAt, status, walkIn }) => ({ id, customerId, customerNameSnapshot, serviceNameSnapshot, startAt, status, walkIn }))
  });
  app.get("/api/admin/support/messages", (_req, res) => {
    ensure(res.locals.user.role === "admin", 403, "Chỉ quản trị viên mới được xem hộp thư chung.");
    const adminId = res.locals.user.id as string;
    res.json(repo.supportMessages.all().filter((item) => canSeeSupportThread(item, res.locals.user))
      .map((item) => ({ ...supportThreadView(item, repo, adminId), ...(item.leaveRequestId ? leaveImpact({ barberId: repo.leaves.get(item.leaveRequestId)?.barberId || "", from: item.leaveFrom || "", to: item.leaveTo || "" }) : {}) }))
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)));
  });
  app.patch("/api/admin/support/messages/:id/reply", wrap((req, res) => {
    ensure(res.locals.user.role === "admin", 403, "Chỉ quản trị viên mới được trả lời thư hỗ trợ.");
    const item = repo.supportMessages.get(req.params.id);
    ensure(item, 404, "Không tìm thấy tin nhắn.");
    ensure(canSeeSupportThread(item, res.locals.user), 403, "Bạn chưa tham gia cuộc trò chuyện này.");
    const { reply } = z.object({ reply: z.string().trim().min(2).max(500) }).parse(req.body);
    const updated = appendSupportEntry(item, res.locals.user, reply);
    repo.supportMessages.put(updated);
    if (item.customerId) repo.notifications.put({ id: randomUUID(), customerId: item.customerId, title: "Salon đã trả lời", body: reply,
      kind: "manual", createdAt: new Date().toISOString(), read: false });
    res.json(supportThreadView(updated, repo, res.locals.user.id));
  }));
  app.get("/api/admin/dashboard-live", wrap((_req, res) => {
    const now = DateTime.now().setZone(SHOP_ZONE);
    const today = now.toISODate()!;
    const todayItems = repo.appointments.all().filter((item) => shopDay(item) === today);
    const weekStart = now.startOf("week").toISODate()!;
    const weekEnd = now.endOf("week").toISODate()!;
    const upcoming = repo.appointments.all().filter((item) => active(item) && shopDay(item) >= weekStart && shopDay(item) <= weekEnd)
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
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
      paidRevenue: sum(todayItems.filter(isAppointmentPaymentConfirmed), (item) => item.amountPaid || 0),
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
    const paid = completed.filter(isAppointmentPaymentConfirmed);
    const byPayment = (["cash", "transfer", "card"] as const).map((method) => ({ method,
      total: sum(paid.filter((item) => item.paymentMethod === method), (item) => item.amountPaid || 0) }));
    const byService = repo.services.all().map((service) => {
      const items = completed.filter((item) => (item.serviceIds || [item.serviceId]).includes(service.id));
      const paidItems = items.filter(isAppointmentPaymentConfirmed);
      return { serviceId: service.id, name: service.name, count: items.length,
        revenue: sum(paidItems, (item) => {
          const entry = item.serviceItems?.find((part) => part.id === service.id);
          const base = item.serviceItems?.reduce((total, part) => total + part.price, 0) || 0;
          return entry && base ? Math.round((item.amountPaid || 0) * entry.price / base) : (item.amountPaid || 0);
        }) };
    }).sort((a, b) => b.revenue - a.revenue);
    const byBarber = repo.barbers.all().map((barber) => {
      const items = completed.filter((item) => item.barberId === barber.id);
      const paidItems = items.filter(isAppointmentPaymentConfirmed);
      const revenue = sum(paidItems, (item) => item.amountPaid || 0);
      const rated = repo.appointments.all().filter((item) => item.barberId === barber.id && item.rating);
      return { barberId: barber.id, name: barber.name, count: items.length, revenue,
        commission: sum(paidItems, (item) => appointmentCommission(item, barber.commissionRate || 0)),
        ratingAverage: rated.length ? Math.round(sum(rated, (item) => item.rating || 0) * 10 / rated.length) / 10 : null };
    }).sort((a, b) => b.revenue - a.revenue);
    const peakHours = Array.from({ length: 13 }, (_, index) => {
      const hour = index + 8;
      return { hour, count: period.filter((item) => DateTime.fromISO(item.startAt).setZone(SHOP_ZONE).hour === hour).length };
    });
    const customers = new Set(completed.filter((item) => !item.walkIn).map((item) => item.customerId));
    const allCompleted = repo.appointments.all().filter((item) => item.status === "completed");
    const repeat = [...customers].filter((id) => allCompleted.filter((item) => item.customerId === id).length > 1).length;
    res.json({ from: query.from, to: query.to,
      completedRevenue: sum(paid, (item) => item.priceSnapshot),
      paidRevenue: sum(paid, (item) => item.amountPaid || 0),
      expectedRevenue: sum(period.filter(active), (item) => item.priceSnapshot),
      byPayment, byService, byBarber, peakHours,
      retentionRate: customers.size ? Math.round(repeat * 1000 / customers.size) / 10 : 0
    });
  }));

  const blockSchema = z.object({ barberId: z.string().min(1), date, startTime: time, endTime: time, reason: z.string().trim().min(2).max(200) });
  app.get("/api/admin/blocks", wrap((req, res) => {
    const query = z.object({ date: date.optional(), from: date.optional(), to: date.optional(), barberId: z.string().optional() }).parse(req.query);
    ensure(!query.from || !query.to || query.from <= query.to, 400, "Khoảng ngày chặn không hợp lệ.");
    res.json(repo.blocks.all().filter((block) =>
      (!query.date || block.date === query.date) && (!query.from || block.date >= query.from) &&
      (!query.to || block.date <= query.to) && (!query.barberId || block.barberId === query.barberId)));
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
  app.get("/api/admin/leaves", (_req, res) => { res.json(repo.leaves.all().map((leave) => ({ ...leave, ...leaveImpact(leave) }))); });
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
    const { status, confirmCancelAppointments } = z.object({ status: z.enum(["approved", "rejected"]), confirmCancelAppointments: z.boolean().optional().default(false) }).parse(req.body);
    ensure(leave.status === "pending", 409, "Đơn nghỉ này đã được xử lý.");
    const barber = repo.barbers.get(leave.barberId);
    const affectedAppointments = repo.appointments.all().filter((item) => item.barberId === leave.barberId && active(item) && shopDay(item) >= leave.from && shopDay(item) <= leave.to);
    const affectedSchedules = repo.schedules.all().filter((item) => item.barberId === leave.barberId && item.date >= leave.from && item.date <= leave.to);
    if (status === "approved" && affectedAppointments.length) ensure(confirmCancelAppointments, 409,
      `Có ${affectedAppointments.length} lịch khách sẽ bị hủy. Hãy xem lại danh sách và xác nhận duyệt nghỉ.`);
    const admin: User = res.locals.user;
    const apologyNotices = [];
    if (status === "approved") {
      for (const schedule of affectedSchedules) repo.schedules.remove(schedule.id);
      const cancellationReason = "Thợ xin nghỉ phép; salon xin lỗi vì thay đổi lịch.";
      const bookingService = new BookingService(repo);
      for (const appointment of affectedAppointments) bookingService.changeStatus(appointment.id, "cancelled", cancellationReason);
      const byCustomer = new Map<string, typeof affectedAppointments>();
      for (const appointment of affectedAppointments) {
        if (appointment.walkIn || repo.users.get(appointment.customerId)?.role !== "customer") continue;
        const items = byCustomer.get(appointment.customerId) || [];
        items.push(appointment);
        byCustomer.set(appointment.customerId, items);
      }
      for (const [customerId, appointments] of byCustomer) {
        const customer = repo.users.get(customerId);
        if (!customer) continue;
        const details = appointments.map((item) => `${DateTime.fromISO(item.startAt).setZone(SHOP_ZONE).toFormat("dd/MM HH:mm")} · ${item.serviceNameSnapshot}`).join("; ");
        const apology = `HairMatch xin lỗi ${customer.name}. Do ${barber?.name || "thợ phụ trách"} xin nghỉ, lịch ${details} đã được hủy. Mong bạn thông cảm vì sự bất tiện này; bạn có thể nhắn lại để salon hỗ trợ đặt giờ khác.`;
        const existing = repo.supportMessages.all().find((item) => item.customerId === customerId && item.contactRole !== "barber" &&
          !supportEntries(item).some((entry) => entry.senderRole === "barber"));
        const thread = existing ? appendSupportEntry(existing, admin, apology) : makeSupportThread({ customerId, sender: admin, recipient: customer,
          contactId: admin.id, contactRole: "admin", appointmentId: appointments[0]?.id, body: apology });
        repo.supportMessages.put(thread);
        const notice = { id: randomUUID(), customerId, title: "Salon xin lỗi vì thay đổi lịch", body: apology, kind: "booking" as const,
          appointmentId: appointments[0]?.id, createdAt: new Date().toISOString(), read: false };
        repo.notifications.put(notice);
        apologyNotices.push(notice);
      }
    }
    const updated = { ...leave, status }; repo.leaves.put(updated);
    const thread = repo.supportMessages.all().find((item) => item.leaveRequestId === leave.id);
    if (thread) {
      const notice = status === "approved"
        ? `Đơn xin nghỉ ${leave.from} → ${leave.to} đã được duyệt. Đã gỡ ${affectedSchedules.length} ca, hủy ${affectedAppointments.length} lịch khách và gửi lời xin lỗi riêng cho ${apologyNotices.length} khách có tài khoản bị ảnh hưởng.`
        : `Đơn xin nghỉ ${leave.from} → ${leave.to} đã bị từ chối.`;
      repo.supportMessages.put({ ...appendSupportEntry({ ...thread, leaveRequestStatus: status }, res.locals.user, notice), leaveRequestStatus: status });
    }
    if (apologyNotices.length) void sendPush(repo, apologyNotices);
    res.json({ ...updated, cancelledAppointmentCount: status === "approved" ? affectedAppointments.length : 0,
      removedShiftCount: status === "approved" ? affectedSchedules.length : 0, apologizedCustomerCount: status === "approved" ? apologyNotices.length : 0 });
  }));

  const weeklySchema = z.object({ barberId: z.string().min(1), weekday: z.number().int().min(1).max(7), startTime: time, endTime: time, from: date, to: date });
  app.get("/api/admin/weekly-shifts", (_req, res) => { res.json(repo.weeklyShifts.all()); });
  app.post("/api/admin/weekly-shifts", wrap((req, res) => {
    const body = weeklySchema.parse(req.body);
    ensure(repo.barbers.get(body.barberId), 404, "Không tìm thấy thợ.");
    const today = DateTime.now().setZone(SHOP_ZONE).toISODate()!;
    const from = DateTime.fromISO(body.from, { zone: SHOP_ZONE });
    const to = DateTime.fromISO(body.to, { zone: SHOP_ZONE });
    ensure(body.from >= today, 400, "Không thể tạo ca lặp cho ngày đã qua.");
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
  app.post("/api/admin/work-schedules/auto", wrap((req, res) => {
    const body = z.object({ from: date, to: date, barberId: z.string().optional() }).parse(req.body);
    const today = DateTime.now().setZone(SHOP_ZONE).toISODate()!;
    const from = DateTime.fromISO(body.from, { zone: SHOP_ZONE });
    const to = DateTime.fromISO(body.to, { zone: SHOP_ZONE });
    ensure(body.from >= today, 400, "Không thể tự xếp ca cho ngày đã qua.");
    ensure(to >= from && to.diff(from, "days").days <= 90, 400, "Khoảng tự xếp lịch tối đa 90 ngày.");

    const activeBarbers = repo.barbers.all().filter((barber) => barber.active && (!body.barberId || barber.id === body.barberId));
    ensure(activeBarbers.length > 0, 400, "Không tìm thấy thợ đang hoạt động để xếp ca.");
    const activeBarberIds = new Set(activeBarbers.map((barber) => barber.id));
    const rules = repo.weeklyShifts.all().filter((rule) => activeBarberIds.has(rule.barberId));
    const barbersWithRules = new Set(rules.map((rule) => rule.barberId));
    const fallbackBarbers = activeBarbers.filter((barber) => !barbersWithRules.has(barber.id));
    let createdCount = 0;
    let skippedLeaveCount = 0;
    let skippedExistingCount = 0;
    const templates = [
      ...rules.map((rule) => ({ barberId: rule.barberId, weekday: rule.weekday, startTime: rule.startTime, endTime: rule.endTime, from: rule.from, to: rule.to, sourceWeeklyId: rule.id })),
      ...fallbackBarbers.flatMap((barber) => [1, 2, 3, 4, 5, 6].map((weekday) => ({ barberId: barber.id, weekday, startTime: "09:00", endTime: "18:00", from: body.from, to: body.to, sourceWeeklyId: undefined as string | undefined })))
    ];
    for (const rule of templates) {
      const ruleFrom = DateTime.fromISO(rule.from, { zone: SHOP_ZONE });
      const ruleTo = DateTime.fromISO(rule.to, { zone: SHOP_ZONE });
      const start = from > ruleFrom ? from : ruleFrom;
      const end = to < ruleTo ? to : ruleTo;
      for (let day = start; day <= end; day = day.plus({ days: 1 })) {
        if (day.weekday !== rule.weekday) continue;
        const dayKey = day.toISODate()!;
        const leave = repo.leaves.all().some((item) => item.barberId === rule.barberId && item.status !== "rejected" && item.from <= dayKey && item.to >= dayKey);
        if (leave) { skippedLeaveCount += 1; continue; }
        const schedule = { id: randomUUID(), barberId: rule.barberId, date: dayKey, startTime: rule.startTime, endTime: rule.endTime, sourceWeeklyId: rule.sourceWeeklyId };
        const bounds = scheduleBounds(schedule);
        const overlapsExisting = repo.schedules.all().some((other) => {
          if (other.barberId !== schedule.barberId || other.date !== schedule.date) return false;
          const existingBounds = scheduleBounds(other);
          return overlaps(bounds.start.toMillis(), bounds.end.toMillis(), existingBounds.start.toMillis(), existingBounds.end.toMillis());
        });
        if (overlapsExisting) { skippedExistingCount += 1; continue; }
        repo.schedules.put(schedule);
        createdCount += 1;
      }
    }
    res.json({ createdCount, skippedLeaveCount, skippedExistingCount, defaultBarberCount: fallbackBarbers.length });
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
