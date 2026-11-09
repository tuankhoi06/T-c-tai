import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { SHOP_ZONE } from "./config.js";
import { hashPassword } from "./security.js";

import type {
  Appointment,
  Barber,
  HairService,
  Session,
  User,
  WorkSchedule,
  TimeBlock,
  LeaveRequest,
  WeeklyShift,
  Voucher,
  Notification,
  PushDevice,
  SupportMessage
} from "./models.js";

export interface Repository {
  readonly storageType?: "in-memory" | "supabase";
  flush?(): Promise<void>;
  users: {
    all(): User[];
    get(id: string): User | undefined;
    byPhone(phone: string): User | undefined;
    byEmail(email: string): User | undefined;
    byPhoneOrEmail(identifier: string): User | undefined;
    put(user: User): void;
    remove(id: string): void;
  };

  services: {
    all(): HairService[];
    get(id: string): HairService | undefined;
    put(service: HairService): void;
    remove(id: string): void;
  };

  barbers: {
    all(): Barber[];
    get(id: string): Barber | undefined;
    put(barber: Barber): void;
    remove(id: string): void;
  };

  schedules: {
    all(): WorkSchedule[];
    get(id: string): WorkSchedule | undefined;
    put(schedule: WorkSchedule): void;
    remove(id: string): void;
  };

  appointments: {
    all(): Appointment[];
    get(id: string): Appointment | undefined;
    put(appointment: Appointment): void;
  };

  blocks: ReturnType<typeof collection<TimeBlock>>;
  leaves: ReturnType<typeof collection<LeaveRequest>>;
  weeklyShifts: ReturnType<typeof collection<WeeklyShift>>;
  vouchers: ReturnType<typeof collection<Voucher>>;
  notifications: ReturnType<typeof collection<Notification>>;
  pushDevices: ReturnType<typeof collection<PushDevice>>;
  supportMessages: ReturnType<typeof collection<SupportMessage>>;

  sessions: {
    get(token: string): Session | undefined;
    put(token: string, session: Session): void;
    remove(token: string): void;
  };
}

function collection<T extends { id: string }>() {
  const data = new Map<string, T>();

  return {
    all: () => [...data.values()],
    get: (id: string) => data.get(id),
    put: (item: T) => {
      data.set(item.id, item);
    },
    remove: (id: string) => {
      data.delete(id);
    }
  };
}

export class MemoryRepository implements Repository {
  readonly storageType: "in-memory" | "supabase" = "in-memory";
  private userCollection = collection<User>();

  users = {
    ...this.userCollection,
    byPhone: (phone: string) =>
      this.userCollection.all().find((user) => user.phone === phone),
    byEmail: (email: string) =>
      this.userCollection.all().find((user) => user.email && user.email.toLowerCase() === email.toLowerCase()),
    byPhoneOrEmail: (identifier: string) => {
      const clean = identifier.trim().toLowerCase();
      return this.userCollection.all().find(
        (user) => user.phone === clean || (user.email && user.email.toLowerCase() === clean)
      );
    }
  };

  services = collection<HairService>();
  barbers = collection<Barber>();
  schedules = collection<WorkSchedule>();
  appointments = collection<Appointment>();
  blocks = collection<TimeBlock>();
  leaves = collection<LeaveRequest>();
  weeklyShifts = collection<WeeklyShift>();
  vouchers = collection<Voucher>();
  notifications = collection<Notification>();
  pushDevices = collection<PushDevice>();
  supportMessages = collection<SupportMessage>();

  private sessionMap = new Map<string, Session>();

  sessions = {
    get: (token: string) => this.sessionMap.get(token),
    put: (token: string, session: Session) => {
      this.sessionMap.set(token, session);
    },
    remove: (token: string) => {
      this.sessionMap.delete(token);
    }
  };

  async seed(): Promise<void> {
    const admin: User = {
      id: "admin-demo",
      name: "Chủ tiệm HairMatch",
      phone: "0900000000",
      email: "admin@hairmatch.vn",
      passwordHash: await hashPassword("Admin123!"),
      role: "admin"
    };

    const customer: User = {
      id: "customer-demo",
      name: "Khách hàng demo",
      phone: "0911111111",
      email: "customer@hairmatch.vn",
      passwordHash: await hashPassword("Customer123!"),
      role: "customer",
      tier: "silver",
      blacklisted: false,
      hairHistory: []
    };
    const sampleCustomers: User[] = [
      {
        id: "customer-lan",
        name: "Lan Anh",
        phone: "0922222222",
        email: "lan.anh@hairmatch.vn",
        passwordHash: await hashPassword("Customer123!"),
        role: "customer",
        tier: "gold",
        loyaltyPoints: 320,
        blacklisted: false,
        internalNote: "Ưa kiểu tóc gọn, dễ chăm sóc.",
        hairHistory: [{ id: "hair-lan-1", date: DateTime.now().setZone(SHOP_ZONE).minus({ days: 18 }).toISODate()!, style: "Layer ngang vai", note: "Tỉa nhẹ phần đuôi" }]
      },
      {
        id: "customer-nam",
        name: "Hoàng Nam",
        phone: "0933333333",
        email: "hoang.nam@hairmatch.vn",
        passwordHash: await hashPassword("Customer123!"),
        role: "customer",
        tier: "silver",
        loyaltyPoints: 90,
        blacklisted: false,
        hairHistory: []
      }
    ];

    this.users.put(admin);
    this.users.put(customer);
    sampleCustomers.forEach((sampleCustomer) => this.users.put(sampleCustomer));

    this.sessions.put("demo-customer-token", {
      userId: customer.id,
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000
    });

    const services: HairService[] = [
      {
        id: "cut",
        name: "Cắt tóc",
        description: "Tư vấn và cắt tóc theo phong cách mong muốn.",
        price: 100000,
        durationMinutes: 30,
        active: true,
        category: "cut",
        process: "Tư vấn, cắt tạo kiểu và hoàn thiện bằng sáp."
      },
      {
        id: "wash",
        name: "Gội và chăm sóc tóc",
        description: "Gội đầu, sấy và tạo kiểu cơ bản.",
        price: 80000,
        durationMinutes: 30,
        active: true,
        category: "wash",
        process: "Gội thư giãn, chăm sóc da đầu và sấy tạo kiểu.",
        promotionPrice: 70000
      },
      {
        id: "dye",
        name: "Nhuộm tóc",
        description: "Màu và quy trình được tư vấn trực tiếp tại tiệm.",
        price: 500000,
        durationMinutes: 120,
        active: true,
        category: "chemical"
      },
      {
        id: "perm",
        name: "Uốn tóc",
        description: "Thợ kiểm tra tình trạng tóc trước khi thực hiện.",
        price: 450000,
        durationMinutes: 90,
        active: true,
        category: "chemical"
      }
    ];

    services.forEach((service) => this.services.put(service));

    const barbers: Barber[] = [
      {
        id: "barber-1",
        name: "Minh",
        bio: "Cắt tóc gọn gàng, phong cách hiện đại.",
        imageUrl: "",
        active: true,
        title: "master",
        serviceIds: ["cut", "wash"],
        commissionRate: 15
      },
      {
        id: "barber-2",
        name: "An",
        bio: "Tư vấn màu tóc và tạo kiểu.",
        imageUrl: "",
        active: true,
        title: "top",
        serviceIds: ["cut", "wash", "dye", "perm"],
        commissionRate: 12
      },
      {
        id: "barber-3",
        name: "Lâm",
        bio: "Chuyên taper, fade gọn và tư vấn kiểu tóc dễ chăm sóc.",
        imageUrl: "",
        active: true,
        title: "top",
        serviceIds: ["cut", "wash"],
        commissionRate: 12
      },
      {
        id: "barber-4",
        name: "Duy",
        bio: "Master barber, nhiều kinh nghiệm uốn và tạo kiểu cổ điển.",
        imageUrl: "",
        active: true,
        title: "master",
        serviceIds: ["cut", "wash", "dye", "perm"],
        commissionRate: 15
      },
      {
        id: "barber-5",
        name: "Khoa",
        bio: "Stylist trẻ, cắt gọn và chăm sóc tóc nam.",
        imageUrl: "",
        active: true,
        title: "junior",
        serviceIds: ["cut", "wash"],
        commissionRate: 10
      }
    ];

    barbers.forEach((barber) => this.barbers.put(barber));

    const today = DateTime.now()
      .setZone(SHOP_ZONE)
      .startOf("day");

    for (let day = 0; day < 30; day += 1) {
      const date = today.plus({ days: day }).toISODate()!;

      for (const barber of barbers) {
        this.schedules.put({
          id: randomUUID(),
          barberId: barber.id,
          date,
          startTime: "09:00",
          endTime: "19:00"
        });
      }
    }

    const makeSampleAppointment = (
      id: string,
      client: User,
      barberId: string,
      serviceId: string,
      daysFromToday: number,
      hour: number,
      minute: number,
      status: Appointment["status"],
      extra: Partial<Appointment> = {}
    ): Appointment => {
      const barber = this.barbers.get(barberId)!;
      const service = this.services.get(serviceId)!;
      const start = today.plus({ days: daysFromToday }).set({ hour, minute, second: 0, millisecond: 0 });
      const end = start.plus({ minutes: service.durationMinutes });
      return {
        id,
        customerId: client.id,
        customerNameSnapshot: client.name,
        customerPhoneSnapshot: client.phone,
        barberId,
        barberNameSnapshot: barber.name,
        serviceId,
        serviceIds: [serviceId],
        serviceItems: [{ id: service.id, name: service.name, price: service.price, durationMinutes: service.durationMinutes }],
        serviceNameSnapshot: service.name,
        priceSnapshot: service.promotionPrice ?? service.price,
        durationSnapshot: service.durationMinutes,
        startAt: start.toISO()!,
        endAt: end.toISO()!,
        status,
        createdAt: start.minus({ days: 2 }).toISO()!,
        ...extra
      };
    };

    const pastAppointment = makeSampleAppointment("sample-history-cut", customer, "barber-1", "cut", -7, 10, 0, "completed", {
      rating: 5,
      review: "Tư vấn kỹ, kiểu tóc gọn và dễ chăm sóc.",
      styleName: "Classic taper",
      portfolioConsent: true,
      paymentMethod: "cash",
      amountPaid: 100000
    });
    this.appointments.put(pastAppointment);
    this.appointments.put(makeSampleAppointment("sample-next-lan", sampleCustomers[0], "barber-4", "cut", 1, 11, 0, "pending"));
    this.appointments.put(makeSampleAppointment("sample-next-nam", sampleCustomers[1], "barber-5", "wash", 1, 14, 30, "confirmed"));
    this.appointments.put(makeSampleAppointment("sample-next-customer", customer, "barber-3", "cut", 2, 10, 0, "confirmed"));
    this.appointments.put(makeSampleAppointment("sample-next-color", sampleCustomers[0], "barber-2", "dye", 2, 15, 0, "confirmed"));

    const dateAfterOneDay = today.plus({ days: 1 }).toISODate()!;
    const dateAfterThirtyDays = today.plus({ days: 30 }).toISODate()!;
    const sampleVouchers: Voucher[] = [
      { id: "voucher-trim10", code: "TRIM10", kind: "percent", value: 10, maxUses: 100, usedCount: 12, from: today.toISODate()!, to: dateAfterThirtyDays, active: true },
      { id: "voucher-gio-vang", code: "GIOVANG", kind: "percent", value: 15, maxUses: 30, usedCount: 4, from: today.toISODate()!, to: dateAfterThirtyDays, startTime: "13:00", endTime: "16:00", active: true }
    ];
    sampleVouchers.forEach((voucher) => this.vouchers.put(voucher));

    this.blocks.put({ id: "sample-block-cleaning", barberId: "barber-4", date: dateAfterOneDay, startTime: "12:00", endTime: "13:00", reason: "Nghỉ trưa · vệ sinh dụng cụ" });
    this.notifications.put({ id: "sample-notification-promo", customerId: customer.id, title: "Ưu đãi dành cho bạn", body: "Nhập TRIM10 để giảm 10% cho lần ghé tiệm tiếp theo.", createdAt: today.minus({ days: 1 }).toISO()!, read: false, kind: "promotion" });
    this.supportMessages.put({ id: "sample-support-message", customerId: sampleCustomers[0].id, body: "Mình muốn hỏi thêm cách chăm sóc tóc sau khi uốn.", createdAt: today.toISO()! });
  }
}

