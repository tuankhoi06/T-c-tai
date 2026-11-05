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
});

