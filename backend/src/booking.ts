import { randomUUID } from "node:crypto";
import { Mutex } from "async-mutex";
import { DateTime } from "luxon";

import { SHOP_ZONE } from "./config.js";
import { ensure } from "./errors.js";

import type {
  Appointment,
  AppointmentStatus,
  User,
  WorkSchedule
} from "./models.js";
import type { Repository } from "./repository.js";

export function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    DateTime.fromISO(value, { zone: SHOP_ZONE }).isValid
  );
}

export function scheduleBounds(schedule: WorkSchedule) {
  const start = DateTime.fromISO(
    `${schedule.date}T${schedule.startTime}`,
    { zone: SHOP_ZONE }
  );

  const end = DateTime.fromISO(
    `${schedule.date}T${schedule.endTime}`,
    { zone: SHOP_ZONE }
  );

  return { start, end };
}

export function overlaps(
  startA: number,
  endA: number,
  startB: number,
  endB: number
): boolean {
  return startA < endB && endA > startB;
}

export class BookingService {
  private mutexes = new Map<string, Mutex>();

  constructor(private repo: Repository) {}

  private mutex(barberId: string): Mutex {
    let mutex = this.mutexes.get(barberId);

    if (!mutex) {
      mutex = new Mutex();
      this.mutexes.set(barberId, mutex);
    }

    return mutex;
  }

  private available(
    barberId: string,
    start: DateTime,
    end: DateTime
  ): boolean {
    return !this.repo.appointments.all().some((appointment) => {
      if (appointment.barberId !== barberId) return false;

      if (
        appointment.status !== "pending" &&
        appointment.status !== "confirmed"
      ) {
        return false;
      }

      return overlaps(
        start.toMillis(),
        end.toMillis(),
        DateTime.fromISO(appointment.startAt).toMillis(),
        DateTime.fromISO(appointment.endAt).toMillis()
      );
    });
  }

  availability(
    barberId: string,
    serviceId: string,
    date: string
  ): string[] {
    ensure(validDate(date), 400, "Ngày không hợp lệ.");

    const barber = this.repo.barbers.get(barberId);
    const service = this.repo.services.get(serviceId);

    ensure(barber?.active, 404, "Thợ không hoạt động.");
    ensure(service?.active, 404, "Dịch vụ không hoạt động.");

    const schedules = this.repo.schedules.all().filter(
      (schedule) =>
        schedule.barberId === barberId && schedule.date === date
    );

    const now = DateTime.now();
    const slots = new Set<string>();

    for (const schedule of schedules) {
      const bounds = scheduleBounds(schedule);

      for (
        let start = bounds.start;
        start < bounds.end;
        start = start.plus({ minutes: 30 })
      ) {
        const end = start.plus({
          minutes: service.durationMinutes
        });

        if (
          start > now &&
          end <= bounds.end &&
          this.available(barberId, start, end)
        ) {
          slots.add(start.toISO()!);
        }
      }
    }

    return [...slots].sort();
  }

  async create(
    user: User,
    input: {
      barberId: string;
      serviceId: string;
      startAt: string;
    }
  ): Promise<Appointment> {
    return this.mutex(input.barberId).runExclusive(() => {
      const barber = this.repo.barbers.get(input.barberId);
      const service = this.repo.services.get(input.serviceId);

      ensure(barber?.active, 404, "Thợ không hoạt động.");
      ensure(service?.active, 404, "Dịch vụ không hoạt động.");

      ensure(
        /(?:Z|[+-]\d{2}:\d{2})$/.test(input.startAt),
        400,
        "Thời gian cần chứa múi giờ."
      );

      const start = DateTime.fromISO(input.startAt, {
        setZone: true
      }).setZone(SHOP_ZONE);

      ensure(start.isValid, 400, "Thời gian không hợp lệ.");
      ensure(start > DateTime.now(), 400, "Không đặt trong quá khứ.");

      const end = start.plus({
        minutes: service.durationMinutes
      });

      const schedules = this.repo.schedules.all().filter(
        (schedule) =>
          schedule.barberId === barber.id &&
          schedule.date === start.toISODate()
      );

      const fitsSchedule = schedules.some((schedule) => {
        const bounds = scheduleBounds(schedule);
        const offsetMinutes = start.diff(
          bounds.start,
          "minutes"
        ).minutes;

        return (
          start >= bounds.start &&
          end <= bounds.end &&
          start.second === 0 &&
          start.millisecond === 0 &&
          offsetMinutes % 30 === 0
        );
      });

      ensure(
        fitsSchedule,
        400,
        "Khung giờ không nằm trong lịch làm việc."
      );

      ensure(
        this.available(barber.id, start, end),
        409,
        "Khung giờ đã được đặt. Vui lòng chọn giờ khác."
      );

      const appointment: Appointment = {
        id: randomUUID(),
        customerId: user.id,
        customerNameSnapshot: user.name,
        barberId: barber.id,
        barberNameSnapshot: barber.name,
        serviceId: service.id,
        serviceNameSnapshot: service.name,
        priceSnapshot: service.price,
        durationSnapshot: service.durationMinutes,
        startAt: start.toISO()!,
        endAt: end.toISO()!,
        status: "pending",
        createdAt: new Date().toISOString()
      };

      this.repo.appointments.put(appointment);
      return appointment;
    });
  }

  cancel(user: User, id: string): Appointment {
    const appointment = this.repo.appointments.get(id);

    ensure(appointment, 404, "Không tìm thấy lịch hẹn.");
    ensure(
      appointment.customerId === user.id,
      403,
      "Không có quyền hủy lịch này."
    );

    ensure(
      appointment.status === "pending" ||
        appointment.status === "confirmed",
      409,
      "Trạng thái lịch không cho phép hủy."
    );

    ensure(
      DateTime.fromISO(appointment.startAt) > DateTime.now(),
      409,
      "Lịch đã đến giờ, vui lòng liên hệ tiệm."
    );

    const updated: Appointment = {
      ...appointment,
      status: "cancelled"
    };

    this.repo.appointments.put(updated);
    return updated;
  }

  changeStatus(
    id: string,
    status: AppointmentStatus
  ): Appointment {
    const appointment = this.repo.appointments.get(id);
    ensure(appointment, 404, "Không tìm thấy lịch hẹn.");

    const allowed: Record<
      AppointmentStatus,
      AppointmentStatus[]
    > = {
      pending: ["confirmed", "cancelled"],
      confirmed: ["completed", "cancelled"],
      completed: [],
      cancelled: []
    };

    ensure(
      allowed[appointment.status].includes(status),
      409,
      "Chuyển trạng thái không hợp lệ."
    );

    if (status === "completed") {
      ensure(
        DateTime.fromISO(appointment.endAt) <= DateTime.now(),
        409,
        "Chưa hết thời gian dịch vụ, không thể hoàn thành."
      );
    }

    if (status === "confirmed") {
      ensure(
        DateTime.fromISO(appointment.startAt) > DateTime.now(),
        409,
        "Không thể xác nhận một lịch đã đến giờ."
      );
    }

    const updated = { ...appointment, status };
    this.repo.appointments.put(updated);

    return updated;
  }
}

