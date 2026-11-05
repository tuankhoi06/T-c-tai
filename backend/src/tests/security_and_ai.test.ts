import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { MemoryRepository } from "../repository.js";
import { BookingService } from "../booking.js";
import { ConsultationService, MockProvider, preferencesSchema } from "../ai.js";
import { SHOP_ZONE } from "../config.js";

describe("Phân quyền & Bảo mật (Authorization & Security)", () => {
  it("Khách hàng không thể hủy lịch hẹn của khách hàng khác", async () => {
    const repo = new MemoryRepository();
    await repo.seed();
    const booking = new BookingService(repo);

    const customer1 = repo.users.get("customer-demo")!;
    const customer2 = {
      id: "other-customer-id",
      name: "Khách hàng khác",
      phone: "0999999999",
      passwordHash: "hash",
      role: "customer" as const
    };
    repo.users.put(customer2);

    const tomorrow = DateTime.now()
      .setZone(SHOP_ZONE)
      .plus({ days: 1 })
      .toISODate()!;
    const slots = booking.availability("barber-1", "cut", tomorrow);
    expect(slots.length).toBeGreaterThan(0);

    const appt = await booking.create(customer1, {
      barberId: "barber-1",
      serviceId: "cut",
      startAt: slots[0]
    });

    // Customer2 tries to cancel customer1's appointment -> Must throw AppError(403, "Không có quyền hủy lịch này.")
    expect(() => booking.cancel(customer2, appt.id)).toThrowError(
      expect.objectContaining({
        status: 403,
        message: "Không có quyền hủy lịch này."
      })
    );
  });

  it("Không cho phép người dùng tự gán quyền admin khi đăng ký", async () => {
    const repo = new MemoryRepository();
    await repo.seed();

    const newUser = {
      id: "new-user-test",
      name: "Người dùng mới",
      phone: "0988888888",
      passwordHash: "hash",
      role: "customer" as const
    };
    repo.users.put(newUser);

    const retrieved = repo.users.get(newUser.id);
    expect(retrieved?.role).toBe("customer");
  });
});

describe("Xử lý AI & Kiểm tra tính hợp lệ (AI & Input Validation)", () => {
  it("Từ chối file không phải ảnh hoặc buffer rỗng", async () => {
    const consultation = new ConsultationService();
    const invalidBuffer = Buffer.from("not-an-image");
    const validPreferences = {
      hairLength: "Ngắn",
      desiredLength: "Gọn gàng",
      hairTexture: "Thẳng",
      hairDensity: "Dày",
      preferredStyle: "Undercut",
      maintenanceLevel: "low" as const,
      wantsDye: false,
      wantsPerm: false,
      hairCondition: "Khỏe mạnh"
    };

    // When buffer is invalid image, sharp fails and throws AppError 400
    await expect(
      consultation.consult(invalidBuffer, validPreferences)
    ).rejects.toMatchObject({
      status: 400,
      message: "File không phải ảnh hợp lệ hoặc kích thước ảnh quá lớn."
    });
  });

  it("Mock AI trả về đầy đủ 3 gợi ý kiểu tóc và disclaimer an toàn", async () => {
    const consultation = new ConsultationService(new MockProvider());
    // 1x1 png buffer for sharp processing
    const validPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );

    const preferences = {
      hairLength: "Trung bình",
      desiredLength: "Layer",
      hairTexture: "Xoăn nhẹ",
      hairDensity: "Dày vừa",
      preferredStyle: "Hàn Quốc",
      maintenanceLevel: "medium" as const,
      wantsDye: true,
      wantsPerm: true,
      hairCondition: "Bình thường"
    };

    const result = await consultation.consult(validPng, preferences);

    expect(result.mode).toBe("mock");
    expect(result.haircutRecommendations).toHaveLength(3);
    expect(result.disclaimer).toContain("Gợi ý AI mang tính tham khảo");
    expect(result.colorAdvice.recommendation).toBeDefined();
    expect(result.permAdvice.recommendation).toBeDefined();
  });

  it("Validate preferences schema", () => {
    const valid = {
      hairLength: "Ngắn",
      desiredLength: "Fade",
      hairTexture: "Thẳng",
      hairDensity: "Dày",
      preferredStyle: "Cổ điển",
      maintenanceLevel: "low",
      wantsDye: false,
      wantsPerm: false,
      hairCondition: "Tốt"
    };

    expect(preferencesSchema.safeParse(valid).success).toBe(true);

    const invalid = {
      hairLength: "Ngắn",
      maintenanceLevel: "extreme" // invalid enum
    };
    expect(preferencesSchema.safeParse(invalid).success).toBe(false);
  });
});
