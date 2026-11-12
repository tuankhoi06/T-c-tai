import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { DateTime } from "luxon";
import { createApp } from "../app.js";
import { BookingService } from "../booking.js";
import { SHOP_ZONE } from "../config.js";
import { MemoryRepository } from "../repository.js";

describe("Đặt cọc, quyền thợ và xóa tài khoản", () => {
  let repo: MemoryRepository;
  let server: Server;
  let base: string;
  const customerToken = "demo-customer-token";
  async function call(path: string, token: string, method = "GET", body?: unknown) {
    const response = await fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: response.status === 204 ? null : await response.json() as any };
  }
  beforeEach(async () => {
    repo = new MemoryRepository(); await repo.seed();
    server = createApp(repo).listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  });
  afterEach(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });

  it("yêu cầu đặt cọc và chỉ xác nhận sau khi thanh toán mô phỏng", async () => {
    const slot = new BookingService(repo).availability("barber-2", "dye", DateTime.now().setZone(SHOP_ZONE).plus({ days: 3 }).toISODate()!)[0];
    expect((await call("/appointments", customerToken, "POST", { barberId: "barber-2", serviceId: "dye", startAt: slot, paymentChoice: "salon" })).status).toBe(400);
    const made = await call("/appointments", customerToken, "POST", { barberId: "barber-2", serviceId: "dye", startAt: slot, paymentChoice: "prepay" });
    expect(made.status).toBe(201);
    expect(made.data.depositRequired).toBe(100000);
    const adminLogin = await fetch(`${base}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@hairmatch.vn", password: "Admin123!" }) });
    const adminToken = (await adminLogin.json()).token;
    expect((await call(`/admin/appointments/${made.data.id}/status`, adminToken, "PATCH", { status: "confirmed" })).status).toBe(409);
    expect((await call(`/appointments/${made.data.id}/simulate-payment`, customerToken, "POST")).data.simulatedPaid).toBe(100000);
    expect((await call(`/admin/appointments/${made.data.id}/status`, adminToken, "PATCH", { status: "confirmed" })).status).toBe(200);
  });

  it("thợ chỉ thấy ca của mình và không thể xem quản trị", async () => {
    const adminLogin = await fetch(`${base}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@hairmatch.vn", password: "Admin123!" }) });
    const adminToken = (await adminLogin.json()).token;
    expect((await call("/admin/barber-accounts", adminToken, "POST", { barberId: "barber-1", email: "minh@example.vn", password: "Barber123!" })).status).toBe(201);
    const login = await fetch(`${base}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "minh@example.vn", password: "Barber123!" }) });
    const token = (await login.json()).token;
    const today = await call("/barber/today", token);
    expect(today.status).toBe(200);
    expect(today.data.appointments.every((item: any) => item.priceSnapshot === undefined && item.customerPhoneSnapshot === undefined)).toBe(true);
    expect((await call("/admin/reports", token)).status).toBe(403);
    expect((await call("/barber/today", customerToken)).status).toBe(403);
  });

  it("khóa đặt lịch sau hai lần vắng mặt và xóa dữ liệu khách", async () => {
    const user = repo.users.get("customer-demo")!;
    repo.users.put({ ...user, noShowCount: 2 });
    const slot = new BookingService(repo).availability("barber-1", "cut", DateTime.now().setZone(SHOP_ZONE).plus({ days: 3 }).toISODate()!)[0];
    expect((await call("/appointments", customerToken, "POST", { barberId: "barber-1", serviceId: "cut", startAt: slot })).status).toBe(403);
    expect((await call("/me", customerToken, "DELETE")).status).toBe(409);
    for (const item of repo.appointments.all().filter((entry) => entry.customerId === user.id && ["pending", "confirmed"].includes(entry.status))) repo.appointments.put({ ...item, status: "cancelled" });
    expect((await call("/me", customerToken, "DELETE")).status).toBe(204);
    expect(repo.users.get(user.id)).toBeUndefined();
    expect(repo.appointments.all().filter((item) => item.id === "sample-history-cut")[0].customerNameSnapshot).toBe("Tài khoản đã xóa");
  });
});
