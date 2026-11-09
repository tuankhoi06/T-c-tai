import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";

import { BookingService, overlaps } from "../booking.js";
import { MemoryRepository } from "../repository.js";
import { SHOP_ZONE } from "../config.js";

describe("Booking", () => {
  it("Nhận biết chồng lấn và cho phép nối tiếp", () => {
    expect(overlaps(0, 30, 15, 45)).toBe(true);
    expect(overlaps(0, 30, 30, 60)).toBe(false);
  });

  it("Hai yêu cầu đồng thời chỉ một yêu cầu thành công", async () => {
    const repo = new MemoryRepository();
    await repo.seed();

    const booking = new BookingService(repo);
    const customer = repo.users.get("customer-demo")!;

    const date = DateTime.now()
      .setZone(SHOP_ZONE)
      .plus({ days: 1 })
      .toISODate()!;

    const slots = booking.availability(
      "barber-1",
      "cut",
      date
    );

    expect(slots.length).toBeGreaterThan(0);

    const input = {
      barberId: "barber-1",
      serviceId: "cut",
      startAt: slots[0]
    };

    const results = await Promise.allSettled([
      booking.create(customer, input),
      booking.create(customer, input)
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1);

    expect(
      results.filter((result) => result.status === "rejected")
    ).toHaveLength(1);
  });

  it("Lịch nối tiếp được phép", async () => {
    const repo = new MemoryRepository();
    await repo.seed();

    const booking = new BookingService(repo);
    const customer = repo.users.get("customer-demo")!;

    const date = DateTime.now()
      .setZone(SHOP_ZONE)
      .plus({ days: 1 })
      .toISODate()!;

    const slots = booking.availability(
      "barber-1",
      "cut",
      date
    );

    await booking.create(customer, {
      barberId: "barber-1",
      serviceId: "cut",
      startAt: slots[0]
    });

    await expect(
      booking.create(customer, {
        barberId: "barber-1",
        serviceId: "cut",
        startAt: slots[1]
      })
    ).resolves.toHaveProperty("status", "pending");
  });

  it("Không cho đặt trong quá khứ", async () => {
    const repo = new MemoryRepository();
    await repo.seed();

    const booking = new BookingService(repo);
    const customer = repo.users.get("customer-demo")!;

    await expect(
      booking.create(customer, {
        barberId: "barber-1",
        serviceId: "cut",
        startAt: "2020-01-01T09:00:00+07:00"
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it("Chỉ hiện slot trong cửa sổ đặt trước 14 ngày", async () => {
    const repo = new MemoryRepository(); await repo.seed();
    const booking = new BookingService(repo);
    const tooFar = DateTime.now().setZone(SHOP_ZONE).plus({ days: 15 }).toISODate()!;
    expect(() => booking.availability("barber-1", "cut", tooFar)).toThrowError(expect.objectContaining({ status: 400 }));
  });

  it("Khách hủy lịch chờ hoặc đã xác nhận trước 2 giờ, kèm lý do", async () => {
    const repo = new MemoryRepository();
    await repo.seed();
    const booking = new BookingService(repo);
    const customer = repo.users.get("customer-demo")!;

    const tomorrow = DateTime.now().setZone(SHOP_ZONE).plus({ days: 1 }).toISODate()!;
    const slots = booking.availability("barber-1", "cut", tomorrow);

    // 1. Tạo lịch mới -> được phép hủy
    const appt = await booking.create(customer, {
      barberId: "barber-1",
      serviceId: "cut",
      startAt: slots[0]
    });
    const cancelled = booking.cancel(customer, appt.id, "Đổi kế hoạch");
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancelReason).toBe("Đổi kế hoạch");

    // 2. Lịch đã được admin duyệt vẫn được hủy trước 2 giờ.
    const appt2 = await booking.create(customer, {
      barberId: "barber-1",
      serviceId: "cut",
      startAt: slots[1]
    });
    booking.changeStatus(appt2.id, "confirmed");
    expect(booking.cancel(customer, appt2.id, "Đổi kế hoạch").status).toBe("cancelled");

    // 3. Lịch còn dưới 2 giờ thì không được tự hủy.
    const appt3 = await booking.create(customer, {
      barberId: "barber-1",
      serviceId: "cut",
      startAt: slots[2]
    });
    // Giả lập giờ hẹn sắp tới.
    const oldAppt = repo.appointments.get(appt3.id)!;
    oldAppt.startAt = DateTime.now().plus({ minutes: 60 }).toISO()!;
    repo.appointments.put(oldAppt);

    expect(() => booking.cancel(customer, appt3.id, "Đổi kế hoạch")).toThrowError(
      expect.objectContaining({ status: 409 })
    );
  });
});

