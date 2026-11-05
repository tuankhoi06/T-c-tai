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
  WorkSchedule
} from "./models.js";

export interface Repository {
  users: {
    all(): User[];
    get(id: string): User | undefined;
    byPhone(phone: string): User | undefined;
    byEmail(email: string): User | undefined;
    byPhoneOrEmail(identifier: string): User | undefined;
    put(user: User): void;
  };

  services: {
    all(): HairService[];
    get(id: string): HairService | undefined;
    put(service: HairService): void;
  };

  barbers: {
    all(): Barber[];
    get(id: string): Barber | undefined;
    put(barber: Barber): void;
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
      role: "customer"
    };

    this.users.put(admin);
    this.users.put(customer);

    const services: HairService[] = [
      {
        id: "cut",
        name: "Cắt tóc",
        description: "Tư vấn và cắt tóc theo phong cách mong muốn.",
        price: 100000,
        durationMinutes: 30,
        active: true
      },
      {
        id: "wash",
        name: "Gội và chăm sóc tóc",
        description: "Gội đầu, sấy và tạo kiểu cơ bản.",
        price: 80000,
        durationMinutes: 30,
        active: true
      },
      {
        id: "dye",
        name: "Nhuộm tóc",
        description: "Màu và quy trình được tư vấn trực tiếp tại tiệm.",
        price: 500000,
        durationMinutes: 120,
        active: true
      },
      {
        id: "perm",
        name: "Uốn tóc",
        description: "Thợ kiểm tra tình trạng tóc trước khi thực hiện.",
        price: 450000,
        durationMinutes: 90,
        active: true
      }
    ];

    services.forEach((service) => this.services.put(service));

    const barbers: Barber[] = [
      {
        id: "barber-1",
        name: "Minh",
        bio: "Cắt tóc gọn gàng, phong cách hiện đại.",
        imageUrl: "",
        active: true
      },
      {
        id: "barber-2",
        name: "An",
        bio: "Tư vấn màu tóc và tạo kiểu.",
        imageUrl: "",
        active: true
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
  }
}

