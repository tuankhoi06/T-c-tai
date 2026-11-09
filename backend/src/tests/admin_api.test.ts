import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { DateTime } from "luxon";
import { createApp } from "../app.js";
import { BookingService } from "../booking.js";
import { SHOP_ZONE } from "../config.js";
import { MemoryRepository } from "../repository.js";
import { createDueReminders, sendPush } from "../notifications.js";

describe("Admin API", () => {
  let server: Server;
  let base: string;
  let repo: MemoryRepository;
  let adminToken: string;
  async function request(path: string, method = "GET", body?: unknown, token = adminToken) {
    const response = await fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: response.status === 204 ? null : await response.json() as any };
  }
  beforeEach(async () => {
    repo = new MemoryRepository(); await repo.seed();
    server = createApp(repo).listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
    const login = await fetch(`${base}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: "0900000000", password: "Admin123!" }) });
    adminToken = (await login.json()).token;
  });
  afterEach(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });

  it("lọc/tìm lịch, yêu cầu lý do hủy và cập nhật dashboard theo ngày phục vụ", async () => {
    const booking = new BookingService(repo);
    const day = DateTime.now().setZone(SHOP_ZONE).plus({ days: 1 }).toISODate()!;
    const slot = booking.availability("barber-1", "cut", day)[0];
    const appointment = await booking.create(repo.users.get("customer-demo")!, { barberId: "barber-1", serviceId: "cut", startAt: slot, aiSuggestion: { haircutName: "Layer", barberNote: "Giữ mái" } });
    const found = await request(`/admin/appointments?date=${day}&barberId=barber-1&status=pending&q=0911111111`);
    expect(found.data.map((item: any) => item.id)).toContain(appointment.id);
    expect(found.data[0].aiHaircutName).toBe("Layer");
    expect((await request(`/admin/appointments?q=${appointment.id}`)).data).toHaveLength(1);
    expect((await request(`/admin/statistics?from=${day}&to=${day}`)).data.pending).toBe(1);
    expect((await request(`/admin/appointments/${appointment.id}/status`, "PATCH", { status: "cancelled" })).status).toBe(400);
    expect((await request(`/admin/appointments/${appointment.id}/status`, "PATCH", { status: "cancelled", cancelReason: "Khách đổi kế hoạch" })).status).toBe(200);
    const stats = (await request(`/admin/statistics?from=${day}&to=${day}`)).data;
    expect(stats.pending).toBe(0); expect(stats.cancelled).toBe(1); expect(stats.completedValue).toBe(0);
    expect((await request(`/admin/appointments/${appointment.id}/status`, "PATCH", { status: "confirmed" })).status).toBe(409);
    expect((await request("/admin/services", "GET", undefined, "demo-customer-token")).status).toBe(403);
    expect((await request("/admin/statistics", "GET", undefined, "demo-customer-token")).status).toBe(403);
    expect((await request(`/admin/appointments/${appointment.id}/status`, "PATCH", { status: "confirmed" }, "demo-customer-token")).status).toBe(403);
  });

  it("dashboard tính giá trị lịch hoàn thành theo ngày phục vụ, không theo ngày cập nhật", async () => {
    const day = DateTime.now().setZone(SHOP_ZONE).minus({ days: 1 });
    const startAt = day.set({ hour: 9, minute: 0, second: 0 }).toISO()!;
    const endAt = day.set({ hour: 9, minute: 30, second: 0 }).toISO()!;
    repo.appointments.put({ id: "old-booking", customerId: "customer-demo", customerNameSnapshot: "Khách hàng demo", barberId: "barber-1", barberNameSnapshot: "Minh", serviceId: "cut", serviceNameSnapshot: "Cắt tóc", priceSnapshot: 100000, durationSnapshot: 30, startAt, endAt, status: "confirmed", createdAt: day.toISO()! });
    expect((await request("/admin/appointments/old-booking/status", "PATCH", { status: "completed" })).status).toBe(200);
    const yesterday = day.toISODate()!;
    const result = (await request(`/admin/statistics?from=${yesterday}&to=${yesterday}`)).data;
    expect(result.completed).toBe(1); expect(result.completedValue).toBe(100000); expect(result.timeZone).toBe(SHOP_ZONE);
    expect((await request("/admin/statistics")).data.completedValue).toBe(0);
  });

  it("CRUD và kích hoạt lại dịch vụ/thợ giữ snapshot lịch cũ", async () => {
    const booking = new BookingService(repo);
    const day = DateTime.now().setZone(SHOP_ZONE).plus({ days: 1 }).toISODate()!;
    const appointment = await booking.create(repo.users.get("customer-demo")!, { barberId: "barber-1", serviceId: "cut", startAt: booking.availability("barber-1", "cut", day)[0] });
    const newService = (await request("/admin/services", "POST", { name: "Gội dưỡng", description: "Test", price: 120000, durationMinutes: 30, active: true })).data;
    expect((await request(`/admin/services/${newService.id}`, "PATCH", { price: 130000 })).data.price).toBe(130000);
    expect((await request(`/admin/services/${newService.id}`, "DELETE")).status).toBe(204);
    expect((await request(`/admin/services/${newService.id}`, "PATCH", { active: false })).data.active).toBe(false);
    expect((await request(`/admin/services/${newService.id}`, "PATCH", { active: true })).data.active).toBe(true);
    const newBarber = (await request("/admin/barbers", "POST", { name: "Bình", bio: "Test", imageUrl: "", active: true })).data;
    expect((await request(`/admin/barbers/${newBarber.id}`, "PATCH", { bio: "Đã sửa" })).data.bio).toBe("Đã sửa");
    expect((await request(`/admin/barbers/${newBarber.id}`, "DELETE")).status).toBe(204);
    expect((await request(`/admin/barbers/${newBarber.id}`, "PATCH", { active: false })).data.active).toBe(false);
    expect((await request(`/admin/barbers/${newBarber.id}`, "PATCH", { active: true })).data.active).toBe(true);
    await request("/admin/services/cut", "PATCH", { name: "Cắt mới", price: 999999, active: false });
    await request("/admin/barbers/barber-1", "PATCH", { name: "Minh mới", active: false });
    expect(repo.appointments.get(appointment.id)).toMatchObject({ serviceNameSnapshot: "Cắt tóc", barberNameSnapshot: "Minh", priceSnapshot: 100000, status: "pending" });
    expect((await request("/admin/services")).data.find((item: any) => item.id === "cut").futureAppointmentCount).toBe(1);
    expect((await request("/admin/barbers")).data.find((item: any) => item.id === "barber-1").futureAppointmentCount).toBe(1);
  });

  it("chặn ca chồng lấn, cho phép nối tiếp và bảo vệ lịch hiệu lực khi sửa/xóa", async () => {
    const day = DateTime.now().setZone(SHOP_ZONE).plus({ days: 35 }).toISODate()!;
    const first = (await request("/admin/work-schedules", "POST", { barberId: "barber-1", date: day, startTime: "09:00", endTime: "12:00" })).data;
    expect((await request("/admin/work-schedules", "POST", { barberId: "barber-1", date: day, startTime: "12:00", endTime: "13:00" })).status).toBe(201);
    expect((await request("/admin/work-schedules", "POST", { barberId: "barber-1", date: day, startTime: "14:00", endTime: "15:00" })).status).toBe(201);
    expect((await request("/admin/work-schedules", "POST", { barberId: "barber-1", date: day, startTime: "11:00", endTime: "13:00" })).status).toBe(409);
    const startAt = DateTime.fromISO(`${day}T09:30`, { zone: SHOP_ZONE }).toISO()!;
    repo.appointments.put({ id: "future-schedule-check", customerId: "customer-demo", customerNameSnapshot: "Khách demo", barberId: "barber-1", barberNameSnapshot: "Minh", serviceId: "cut", serviceNameSnapshot: "Cắt tóc", priceSnapshot: 100000, durationSnapshot: 30, startAt, endAt: DateTime.fromISO(startAt).plus({ minutes: 30 }).toISO()!, status: "pending", createdAt: new Date().toISOString() });
    expect((await request(`/admin/work-schedules/${first.id}`, "PATCH", { startTime: "10:00" })).status).toBe(409);
    expect((await request(`/admin/work-schedules/${first.id}`, "DELETE")).status).toBe(409);
    expect((await request(`/admin/work-schedules/${first.id}`, "PATCH", { startTime: "08:00" })).status).toBe(200);
    const listed = (await request(`/admin/work-schedules?barberId=barber-1&from=${day}&to=${day}`)).data;
    expect(listed.find((item: any) => item.id === first.id).activeAppointmentCount).toBe(1);
  });

  it("admin thêm, đổi giờ lịch hẹn và chặn đặt trùng", async () => {
    const booking = new BookingService(repo);
    const day = DateTime.now().setZone(SHOP_ZONE).plus({ days: 1 }).toISODate()!;
    const [first, second] = booking.availability("barber-1", "cut", day);
    expect((await request("/admin/customers")).data.map((user: any) => user.id)).toContain("customer-demo");
    expect((await request("/admin/customers", "GET", undefined, "demo-customer-token")).status).toBe(403);
    const created = await request("/admin/appointments", "POST", { customerId: "customer-demo", barberId: "barber-1", serviceId: "cut", startAt: first });
    expect(created.status).toBe(201);
    expect(created.data.customerNameSnapshot).toBe("Khách hàng demo");
    expect((await request("/admin/appointments", "POST", { customerId: "customer-demo", barberId: "barber-1", serviceId: "cut", startAt: first })).status).toBe(409);
    const moved = await request(`/admin/appointments/${created.data.id}`, "PATCH", { barberId: "barber-1", serviceId: "cut", startAt: second });
    expect(moved.status).toBe(200);
    expect(moved.data.id).toBe(created.data.id);
    expect(moved.data.startAt).toBe(second);
    expect((await request(`/admin/appointments/${created.data.id}`, "PATCH", { barberId: "barber-1", serviceId: "cut", startAt: second })).status).toBe(200);
    expect((await request("/admin/appointments", "POST", { customerId: "customer-demo", barberId: "barber-1", serviceId: "cut", startAt: first })).status).toBe(201);
    expect((await request(`/admin/appointments/${created.data.id}`, "PATCH", { barberId: "barber-1", serviceId: "cut", startAt: first })).status).toBe(409);
    expect((await request(`/admin/appointments/${created.data.id}`, "PATCH", { barberId: "barber-1", serviceId: "cut", startAt: first }, "demo-customer-token")).status).toBe(403);
  });

  it("xóa hẳn dịch vụ/thợ chưa có lịch, giữ bản ghi đã có lịch hẹn", async () => {
    expect((await request("/admin/services/cut?permanent=true", "DELETE")).status).toBe(204);
    const service = (await request("/admin/services", "POST", { name: "Gội", description: "", price: 100000, durationMinutes: 30, active: true })).data;
    expect((await request(`/admin/services/${service.id}?permanent=true`, "DELETE")).status).toBe(204);
    expect(repo.services.get(service.id)).toBeUndefined();
    const barber = (await request("/admin/barbers", "POST", { name: "Lan", bio: "", imageUrl: "", active: true })).data;
    const day = DateTime.now().setZone(SHOP_ZONE).plus({ days: 35 }).toISODate()!;
    await request("/admin/work-schedules", "POST", { barberId: barber.id, date: day, startTime: "09:00", endTime: "12:00" });
    expect((await request(`/admin/barbers/${barber.id}?permanent=true`, "DELETE")).status).toBe(204);
    expect(repo.barbers.get(barber.id)).toBeUndefined();
    expect(repo.schedules.all().filter((item) => item.barberId === barber.id)).toHaveLength(0);
    const appointment = await new BookingService(repo).create(repo.users.get("customer-demo")!, { barberId: "barber-1", serviceId: "wash", startAt: new BookingService(repo).availability("barber-1", "wash", DateTime.now().setZone(SHOP_ZONE).plus({ days: 1 }).toISODate()!)[0] });
    expect(appointment).toBeDefined();
    expect((await request("/admin/barbers/barber-1?permanent=true", "DELETE")).status).toBe(409);
    expect((await request("/admin/services/wash?permanent=true", "DELETE")).status).toBe(409);
  });

  it("admin thêm, sửa, xóa khách chưa có lịch và bảo vệ khách đã đặt lịch", async () => {
    const created = await request("/admin/customers", "POST", { name: "Khách mới", phone: "0987654321", email: "", password: "Password123" });
    expect(created.status).toBe(201);
    expect(created.data.passwordHash).toBeUndefined();
    expect((await request("/admin/customers", "POST", { name: "Trùng", phone: "0987654321", email: "", password: "Password123" })).status).toBe(409);
    const updated = await request(`/admin/customers/${created.data.id}`, "PATCH", { name: "Khách đã sửa", email: "new@example.com" });
    expect(updated.data.name).toBe("Khách đã sửa");
    expect(updated.data.email).toBe("new@example.com");
    expect((await request(`/admin/customers/${created.data.id}`, "DELETE")).status).toBe(204);
    expect(repo.users.get(created.data.id)).toBeUndefined();
    const day = DateTime.now().setZone(SHOP_ZONE).plus({ days: 1 }).toISODate()!;
    const booking = new BookingService(repo);
    await booking.create(repo.users.get("customer-demo")!, { barberId: "barber-1", serviceId: "cut", startAt: booking.availability("barber-1", "cut", day)[0] });
    expect((await request("/admin/customers/customer-demo", "DELETE")).status).toBe(409);
    expect((await request("/admin/customers/admin-demo", "DELETE")).status).toBe(404);
    expect((await request("/admin/customers", "POST", { name: "Không quyền", phone: "0988888888", password: "Password123" }, "demo-customer-token")).status).toBe(403);
  });

  it("chặn giờ, duyệt nghỉ và tạo ca tuần bảo vệ các lịch đang hiệu lực", async () => {
    const booking = new BookingService(repo);
    const day = DateTime.now().setZone(SHOP_ZONE).plus({ days: 1 }).toISODate()!;
    const [first, second] = booking.availability("barber-1", "cut", day);
    const block = await request("/admin/blocks", "POST", { barberId: "barber-1", date: day, startTime: "09:00", endTime: "09:30", reason: "Họp nội bộ" });
    expect(block.status).toBe(201);
    expect(booking.availability("barber-1", "cut", day)).not.toContain(first);
    const appointment = await booking.create(repo.users.get("customer-demo")!, { barberId: "barber-1", serviceId: "cut", startAt: second });
    expect((await request("/admin/blocks", "POST", { barberId: "barber-1", date: day, startTime: "09:30", endTime: "10:00", reason: "Bảo trì" })).status).toBe(409);
    const leave = await request("/admin/leaves", "POST", { barberId: "barber-1", from: day, to: day, reason: "Nghỉ phép" });
    expect(leave.status).toBe(201);
    expect((await request(`/admin/leaves/${leave.data.id}`, "PATCH", { status: "approved" })).status).toBe(409);
    await request(`/admin/appointments/${appointment.id}/status`, "PATCH", { status: "cancelled", cancelReason: "Đổi ngày nghỉ" });
    expect((await request(`/admin/leaves/${leave.data.id}`, "PATCH", { status: "approved" })).status).toBe(200);
    expect(booking.availability("barber-1", "cut", day)).toHaveLength(0);
    expect((await request(`/admin/blocks/${block.data.id}`, "DELETE")).status).toBe(204);
    const from = DateTime.now().setZone(SHOP_ZONE).plus({ days: 31 });
    const to = from.plus({ days: 7 });
    const weekly = await request("/admin/weekly-shifts", "POST", { barberId: "barber-1", weekday: from.weekday, startTime: "09:00", endTime: "12:00", from: from.toISODate(), to: to.toISODate() });
    expect(weekly.status).toBe(201);
    expect(weekly.data.generatedCount).toBe(2);
    expect((await request(`/admin/weekly-shifts/${weekly.data.id}`, "DELETE")).status).toBe(204);
  });

  it("khách vãng lai dùng mã ưu đãi và báo cáo ghi nhận thực thu", async () => {
    const day = DateTime.now().setZone(SHOP_ZONE).plus({ days: 1 }).toISODate()!;
    const slot = new BookingService(repo).availability("barber-1", "cut", day)[0];
    const voucher = await request("/admin/vouchers", "POST", { code: "GIOVANG", kind: "percent", value: 10, maxUses: 1, from: day, to: day, active: true });
    expect(voucher.status).toBe(201);
    const walkin = await request("/admin/appointments", "POST", { walkInName: "Khách ghé tiệm", barberId: "barber-1", serviceId: "cut", startAt: slot, voucherCode: "GIOVANG" });
    expect(walkin.status).toBe(201);
    expect(walkin.data).toMatchObject({ walkIn: true, priceSnapshot: 90000, discountAmount: 10000 });
    expect((await request("/admin/vouchers")).data[0].usedCount).toBe(1);
    expect((await request(`/admin/vouchers/${voucher.data.id}`, "DELETE")).status).toBe(409);
    expect((await request(`/admin/vouchers/${voucher.data.id}`, "PATCH", { startTime: "15:00", endTime: "12:00" })).status).toBe(400);
    expect((await request(`/admin/appointments/${walkin.data.id}/status`, "PATCH", { status: "cancelled", cancelReason: "Khách đổi lịch" })).status).toBe(200);
    expect((await request("/admin/vouchers")).data[0].usedCount).toBe(0);
    const past = DateTime.now().setZone(SHOP_ZONE).minus({ hours: 2 });
    repo.appointments.put({ ...walkin.data, id: "past-served", startAt: past.toISO()!, endAt: past.plus({ minutes: 30 }).toISO()!, status: "confirmed", voucherCode: undefined, discountAmount: undefined });
    expect((await request("/admin/appointments/past-served/status", "PATCH", { status: "in_progress" })).status).toBe(200);
    expect((await request("/admin/appointments/past-served/status", "PATCH", { status: "completed", payment: { method: "cash", amount: 90000 } })).status).toBe(200);
    const reportDay = past.toISODate()!;
    const report = (await request(`/admin/reports?from=${reportDay}&to=${reportDay}`)).data;
    expect(report.paidRevenue).toBe(90000);
    expect(report.byPayment.find((item: any) => item.method === "cash").total).toBe(90000);
    expect((await request("/admin/dashboard-live")).data).toHaveProperty("stylistStatus");
  });

  it("CRM giữ ghi chú riêng cho admin, đánh giá và thông báo trong app", async () => {
    const updated = await request("/admin/customers/customer-demo", "PATCH", { tier: "vip", internalNote: "Da đầu nhạy cảm", blacklisted: true });
    expect(updated.data.internalNote).toBe("Da đầu nhạy cảm");
    const me = (await request("/me", "GET", undefined, "demo-customer-token")).data;
    expect(me.internalNote).toBeUndefined();
    expect(me.blacklisted).toBeUndefined();
    const tomorrow = DateTime.now().setZone(SHOP_ZONE).plus({ days: 1 }).toISODate()!;
    const booking = new BookingService(repo);
    const slot = booking.availability("barber-1", "cut", tomorrow)[0];
    expect((await request("/appointments", "POST", { barberId: "barber-1", serviceId: "cut", startAt: slot }, "demo-customer-token")).status).toBe(403);
    const day = DateTime.now().setZone(SHOP_ZONE).minus({ days: 1 });
    repo.appointments.put({ id: "reviewable", customerId: "customer-demo", customerNameSnapshot: "Khách hàng demo", barberId: "barber-1", barberNameSnapshot: "Minh", serviceId: "cut", serviceNameSnapshot: "Cắt tóc", priceSnapshot: 100000, durationSnapshot: 30, startAt: day.toISO()!, endAt: day.plus({ minutes: 30 }).toISO()!, status: "completed", createdAt: day.toISO()! });
    expect((await request("/appointments/reviewable/review", "POST", { rating: 5, review: "Cắt đẹp", photo: "data:image/jpeg;base64,YWJj", portfolioConsent: true }, "demo-customer-token")).status).toBe(200);
    expect((await request("/appointments/reviewable/review", "POST", { rating: 3 }, "demo-customer-token")).status).toBe(409);
    const report = (await request(`/admin/reports?from=${day.toISODate()}&to=${day.toISODate()}`)).data;
    expect(report.byBarber.find((item: any) => item.barberId === "barber-1").ratingAverage).toBe(5);
    expect((await request("/barbers")).data.find((item: any) => item.id === "barber-1").portfolio[0]).toMatchObject({ styleName: "Cắt tóc", rating: 5, photo: "data:image/jpeg;base64,YWJj" });
    expect((await request("/admin/notifications", "POST", { customerId: "customer-demo", title: "Ưu đãi", body: "Hẹn gặp bạn cuối tuần" })).status).toBe(201);
    const inbox = (await request("/notifications/me", "GET", undefined, "demo-customer-token")).data;
    expect(inbox[0].title).toBe("Ưu đãi");
    expect((await request(`/notifications/${inbox[0].id}/read`, "PATCH", undefined, "demo-customer-token")).data.read).toBe(true);
  });

  it("không bỏ kỹ năng của thợ khi còn lịch tương ứng", async () => {
    const day = DateTime.now().setZone(SHOP_ZONE).plus({ days: 1 }).toISODate()!;
    const booking = new BookingService(repo);
    const item = await booking.create(repo.users.get("customer-demo")!, { barberId: "barber-1", serviceId: "cut", startAt: booking.availability("barber-1", "cut", day)[0] });
    expect((await request("/admin/barbers/barber-1", "PATCH", { serviceIds: ["wash"] })).status).toBe(409);
    await request(`/admin/appointments/${item.id}/status`, "PATCH", { status: "cancelled", cancelReason: "Đổi phân công" });
    expect((await request("/admin/barbers/barber-1", "PATCH", { serviceIds: ["wash"] })).status).toBe(200);
    expect((await request(`/availability?barberId=barber-1&serviceId=cut&date=${day}`)).status).toBe(400);
  });

  it("gắn token push đúng tài khoản và tạo nhắc lịch một lần", async () => {
    const token = "ExponentPushToken[example123]";
    expect((await request("/push-tokens", "POST", { token }, "demo-customer-token")).status).toBe(201);
    expect(repo.pushDevices.all()).toHaveLength(1);
    expect((await request("/push-tokens", "POST", { token })).status).toBe(403);
    const start = DateTime.now().setZone(SHOP_ZONE).plus({ minutes: 90 });
    repo.appointments.put({ id: "reminder", customerId: "customer-demo", customerNameSnapshot: "Khách demo", barberId: "barber-1", barberNameSnapshot: "Minh", serviceId: "cut", serviceNameSnapshot: "Cắt tóc", priceSnapshot: 100000, durationSnapshot: 30, startAt: start.toISO()!, endAt: start.plus({ minutes: 30 }).toISO()!, status: "confirmed", createdAt: new Date().toISOString() });
    expect(createDueReminders(repo)).toHaveLength(1);
    expect(createDueReminders(repo)).toHaveLength(0);
    expect((await request("/push-tokens", "DELETE", { token }, "demo-customer-token")).status).toBe(204);
    expect(repo.pushDevices.all()).toHaveLength(0);
  });

  it("gửi push đúng token tới Expo và đếm ticket được nhận", async () => {
    repo.pushDevices.put({ id: "device", customerId: "customer-demo", token: "ExponentPushToken[example123]" });
    const notice = { id: "notice", customerId: "customer-demo", title: "Nhắc lịch", body: "Sắp đến giờ", createdAt: new Date().toISOString(), read: false, kind: "reminder" as const };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      expect(input).toBe("https://exp.host/--/api/v2/push/send");
      const messages = JSON.parse(String(init?.body));
      expect(messages[0]).toMatchObject({ to: "ExponentPushToken[example123]", title: "Nhắc lịch" });
      return new Response(JSON.stringify({ data: [{ status: "ok", id: "ticket" }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    try { expect(await sendPush(repo, [notice])).toEqual({ attempted: 1, accepted: 1 }); }
    finally { globalThis.fetch = originalFetch; }
  });

  it("khách đặt combo, đổi giờ, hủy lịch xác nhận và nhận thông báo", async () => {
    const booking = new BookingService(repo);
    const day = DateTime.now().setZone(SHOP_ZONE).plus({ days: 1 }).toISODate()!;
    const first = booking.availability("barber-1", "cut", day, ["cut", "wash"])[0];
    const created = await request("/appointments", "POST", { barberId: "barber-1", serviceId: "cut", serviceIds: ["cut", "wash"], startAt: first, note: "Da đầu nhạy cảm", paymentChoice: "salon" }, "demo-customer-token");
    expect(created.status).toBe(201);
    expect(created.data).toMatchObject({ durationSnapshot: 60, priceSnapshot: 170000, serviceIds: ["cut", "wash"], note: "Da đầu nhạy cảm" });
    expect((await request("/notifications/me", "GET", undefined, "demo-customer-token")).data.some((item: any) => item.kind === "booking")).toBe(true);
    expect(booking.availability("barber-1", "cut", day)).not.toContain(DateTime.fromISO(first).plus({ minutes: 30 }).toISO());
    const nextDay = DateTime.now().setZone(SHOP_ZONE).plus({ days: 2 }).toISODate()!;
    const next = booking.availability("barber-1", "cut", nextDay, ["cut", "wash"])[0];
    expect((await request(`/appointments/${created.data.id}/reschedule`, "PATCH", { barberId: "barber-1", startAt: next }, "demo-customer-token")).data.startAt).toBe(next);
    expect((await request(`/admin/appointments/${created.data.id}/status`, "PATCH", { status: "confirmed" })).status).toBe(200);
    expect((await request(`/appointments/${created.data.id}/cancel`, "PATCH", { reason: "Đổi kế hoạch" }, "demo-customer-token")).data.status).toBe("cancelled");
  });

  it("nhắc lịch hai mốc, tích điểm và đổi voucher cá nhân", async () => {
    const start = DateTime.now().setZone(SHOP_ZONE).plus({ minutes: 90 });
    const item = { id: "customer-flow", customerId: "customer-demo", customerNameSnapshot: "Khách demo", barberId: "barber-1", barberNameSnapshot: "Minh", serviceId: "cut", serviceNameSnapshot: "Cắt tóc", priceSnapshot: 1000000, durationSnapshot: 30, startAt: start.toISO()!, endAt: start.plus({ minutes: 30 }).toISO()!, status: "confirmed" as const, createdAt: new Date().toISOString() };
    repo.appointments.put(item);
    expect(createDueReminders(repo).map((notice) => notice.stage)).toContain("two_hours");
    repo.appointments.put({ ...item, startAt: DateTime.now().plus({ minutes: 20 }).toISO()! });
    expect(createDueReminders(repo).map((notice) => notice.stage)).toContain("thirty_minutes");
    expect(createDueReminders(repo)).toHaveLength(0);
    repo.appointments.put({ ...item, startAt: DateTime.now().minus({ hours: 2 }).toISO()!, endAt: DateTime.now().minus({ hours: 1 }).toISO()! });
    expect((await request("/admin/appointments/customer-flow/status", "PATCH", { status: "completed", payment: { method: "cash", amount: 1000000 } })).status).toBe(200);
    expect((await request("/me", "GET", undefined, "demo-customer-token")).data.loyaltyPoints).toBe(100);
    const redeemed = await request("/loyalty/redeem", "POST", {}, "demo-customer-token");
    expect(redeemed.status).toBe(201);
    expect(redeemed.data.user.loyaltyPoints).toBe(0);
    expect((await request("/vouchers/me", "GET", undefined, "demo-customer-token")).data.map((voucher: any) => voucher.code)).toContain(redeemed.data.voucher.code);
  });

  it("tạo ưu đãi sinh nhật cá nhân một lần mỗi năm", async () => {
    const user = repo.users.get("customer-demo")!;
    repo.users.put({ ...user, birthday: DateTime.now().setZone(SHOP_ZONE).toISODate()! });
    const notices = await request("/notifications/me", "GET", undefined, "demo-customer-token");
    expect(notices.data.filter((item: any) => item.kind === "birthday")).toHaveLength(1);
    expect((await request("/vouchers/me", "GET", undefined, "demo-customer-token")).data.some((item: any) => item.ownerId === "customer-demo" && item.value === 10)).toBe(true);
    expect((await request("/notifications/me", "GET", undefined, "demo-customer-token")).data.filter((item: any) => item.kind === "birthday")).toHaveLength(1);
  });

  it("khách nhắn hỗ trợ, admin trả lời đúng người", async () => {
    expect((await request("/admin/support/messages", "GET", undefined, "demo-customer-token")).status).toBe(403);
    const sent = await request("/support/messages", "POST", { body: "Tôi muốn hỏi về lịch cắt" }, "demo-customer-token");
    expect(sent.status).toBe(201);
    expect((await request("/admin/support/messages")).data[0].body).toBe("Tôi muốn hỏi về lịch cắt");
    expect((await request(`/admin/support/messages/${sent.data.id}/reply`, "PATCH", { reply: "Tiệm sẽ gọi lại bạn" })).status).toBe(200);
    expect((await request("/support/messages/me", "GET", undefined, "demo-customer-token")).data[0].reply).toBe("Tiệm sẽ gọi lại bạn");
    expect((await request("/notifications/me", "GET", undefined, "demo-customer-token")).data.some((item: any) => item.title === "Salon đã trả lời")).toBe(true);
  });

  it("báo cáo phân bổ doanh thu combo sau giảm giá theo dịch vụ", async () => {
    const day = DateTime.now().setZone(SHOP_ZONE).minus({ days: 1 });
    repo.appointments.put({ id: "combo-report", customerId: "customer-demo", customerNameSnapshot: "Khách demo",
      barberId: "barber-1", barberNameSnapshot: "Minh", serviceId: "cut", serviceIds: ["cut", "wash"],
      serviceNameSnapshot: "Cắt tóc + Gội", serviceItems: [{ id: "cut", name: "Cắt tóc", price: 100000, durationMinutes: 30 }, { id: "wash", name: "Gội", price: 70000, durationMinutes: 30 }],
      priceSnapshot: 153000, durationSnapshot: 60, startAt: day.toISO()!, endAt: day.plus({ minutes: 60 }).toISO()!, status: "completed", createdAt: day.toISO()! });
    const report = (await request(`/admin/reports?from=${day.toISODate()}&to=${day.toISODate()}`)).data;
    expect(report.completedRevenue).toBe(153000);
    expect(report.byService.find((item: any) => item.serviceId === "cut").revenue).toBe(90000);
    expect(report.byService.find((item: any) => item.serviceId === "wash").revenue).toBe(63000);
  });
});
