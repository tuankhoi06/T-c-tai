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
    end: DateTime,
    exceptId?: string
  ): boolean {
    return !this.repo.appointments.all().some((appointment) => {
      if (appointment.id === exceptId) return false;
      if (appointment.barberId !== barberId) return false;

      if (
        appointment.status !== "pending" &&
        appointment.status !== "confirmed" &&
        appointment.status !== "in_progress"
      ) {
        return false;
      }

      return overlaps(
        start.toMillis(),
        end.toMillis(),
        DateTime.fromISO(appointment.startAt).toMillis(),
        DateTime.fromISO(appointment.endAt).toMillis()
      );
    }) && !this.repo.blocks.all().some((block) => {
      if (block.barberId !== barberId || block.date !== start.toISODate()) return false;
      const bounds = scheduleBounds(block);
      return overlaps(start.toMillis(), end.toMillis(), bounds.start.toMillis(), bounds.end.toMillis());
    }) && !this.repo.leaves.all().some((leave) =>
      leave.barberId === barberId && leave.status === "approved" &&
      !!start.toISODate() && start.toISODate()! >= leave.from && start.toISODate()! <= leave.to
    );
  }

  private voucherDiscount(code: string | undefined, price: number, start: DateTime, checkUsage = true, customerId?: string): { discount: number; voucher?: ReturnType<Repository["vouchers"]["get"]> } {
    if (!code) return { discount: 0 };
    const voucher = this.repo.vouchers.all().find((item) => item.code === code.trim().toUpperCase());
    ensure(voucher?.active, 404, "Mã giảm giá không tồn tại hoặc đã ngừng.");
    ensure(!voucher.ownerId || voucher.ownerId === customerId, 403, "Mã này dành riêng cho khách hàng khác.");
    const day = start.toISODate()!;
    const time = start.toFormat("HH:mm");
    ensure(day >= voucher.from && day <= voucher.to && (!voucher.startTime || time >= voucher.startTime) && (!voucher.endTime || time < voucher.endTime), 400, "Mã giảm giá không áp dụng cho khung giờ này.");
    ensure(!checkUsage || voucher.usedCount < voucher.maxUses, 409, "Mã giảm giá đã hết lượt dùng.");
    return { discount: Math.min(price, voucher.kind === "percent" ? Math.floor(price * voucher.value / 100) : voucher.value), voucher };
  }

  private releaseVoucher(appointment: Appointment) {
    if (!appointment.voucherCode) return;
    const voucher = this.repo.vouchers.all().find((item) => item.code === appointment.voucherCode);
    if (voucher) this.repo.vouchers.put({ ...voucher, usedCount: Math.max(0, voucher.usedCount - 1) });
  }

  private selectedServices(serviceId: string, serviceIds?: string[]) {
    const ids = serviceIds?.length ? serviceIds : [serviceId];
    ensure(ids.length > 0 && ids.length <= 5 && new Set(ids).size === ids.length && ids[0] === serviceId,
      400, "Chọn từ 1 đến 5 dịch vụ khác nhau.");
    return ids.map((id) => {
      const service = this.repo.services.get(id);
      ensure(service?.active, 404, "Dịch vụ không hoạt động.");
      return service;
    });
  }

  availability(
    barberId: string,
    serviceId: string,
    date: string,
    serviceIds?: string[]
  ): string[] {
    ensure(validDate(date), 400, "Ngày không hợp lệ.");
    const today = DateTime.now().setZone(SHOP_ZONE).startOf("day");
    ensure(date >= today.toISODate()! && date <= today.plus({ days: 13 }).toISODate()!, 400, "Chỉ nhận đặt lịch trong 14 ngày tới.");

    const barber = this.repo.barbers.get(barberId);
    const services = this.selectedServices(serviceId, serviceIds);

    ensure(barber?.active, 404, "Thợ không hoạt động.");
    ensure(!barber.serviceIds || services.every((service) => barber.serviceIds!.includes(service.id)), 400, "Thợ không thực hiện đủ dịch vụ đã chọn.");
    const durationMinutes = services.reduce((total, service) => total + service.durationMinutes, 0);

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
          minutes: durationMinutes
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
      serviceIds?: string[];
      startAt: string;
      note?: string;
      styleName?: string;
      paymentChoice?: "salon" | "prepay";
      aiSuggestion?: { haircutName: string; barberNote: string };
      voucherCode?: string;
      walkIn?: boolean;
    }
  ): Promise<Appointment> {
    return this.mutex(input.barberId).runExclusive(() => {
      const barber = this.repo.barbers.get(input.barberId);
      const services = this.selectedServices(input.serviceId, input.serviceIds);
      const service = services[0];

      ensure(barber?.active, 404, "Thợ không hoạt động.");
      ensure(!user.blacklisted, 403, "Tài khoản cần liên hệ tiệm trước khi đặt lịch.");
      ensure(!barber.serviceIds || services.every((item) => barber.serviceIds!.includes(item.id)), 400, "Thợ không thực hiện đủ dịch vụ đã chọn.");

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
      const today = DateTime.now().setZone(SHOP_ZONE).startOf("day");
      ensure(start <= today.plus({ days: 13 }).endOf("day"), 400, "Chỉ nhận đặt lịch trong 14 ngày tới.");

      const end = start.plus({
        minutes: services.reduce((total, item) => total + item.durationMinutes, 0)
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

      const serviceItems = services.map((item) => ({ id: item.id, name: item.name,
        price: item.promotionPrice ?? item.price, durationMinutes: item.durationMinutes }));
      const basePrice = serviceItems.reduce((total, item) => total + item.price, 0);
      const { discount, voucher } = this.voucherDiscount(input.voucherCode, basePrice, start, true, user.id);

      const appointment: Appointment = {
        id: randomUUID(),
        customerId: user.id,
        customerNameSnapshot: user.name,
        customerPhoneSnapshot: user.phone,
        barberId: barber.id,
        barberNameSnapshot: barber.name,
        serviceId: service.id,
        serviceNameSnapshot: services.map((item) => item.name).join(" + "),
        serviceIds: services.map((item) => item.id),
        serviceItems,
        priceSnapshot: basePrice - discount,
        ...(input.note ? { note: input.note } : {}),
        ...(input.styleName ? { styleName: input.styleName } : {}),
        paymentChoice: input.paymentChoice || "salon",
        ...(input.walkIn ? { walkIn: true } : {}),
        ...(voucher ? { voucherCode: voucher.code, discountAmount: discount } : {}),
        durationSnapshot: serviceItems.reduce((total, item) => total + item.durationMinutes, 0),
        startAt: start.toISO()!,
        endAt: end.toISO()!,
        status: "pending",
        ...(input.aiSuggestion ? {
          aiHaircutName: input.aiSuggestion.haircutName,
          aiBarberNote: input.aiSuggestion.barberNote
        } : {}),
        createdAt: new Date().toISOString()
      };

      this.repo.appointments.put(appointment);
      if (voucher) this.repo.vouchers.put({ ...voucher, usedCount: voucher.usedCount + 1 });
      if (!input.walkIn) this.repo.notifications.put({ id: randomUUID(), customerId: user.id,
        title: "Đặt lịch thành công", body: `Lịch ${appointment.serviceNameSnapshot} lúc ${start.toFormat("HH:mm dd/MM")}, đang chờ xác nhận.`,
        kind: "booking", appointmentId: appointment.id, createdAt: new Date().toISOString(), read: false });
      return appointment;
    });
  }

  async reschedule(id: string, input: { barberId: string; serviceId: string; serviceIds?: string[]; startAt: string }): Promise<Appointment> {
    return this.mutex(input.barberId).runExclusive(() => {
      const existing = this.repo.appointments.get(id);
      ensure(existing, 404, "Không tìm thấy lịch hẹn.");
      ensure(existing.status === "pending" || existing.status === "confirmed", 409, "Chỉ có thể sửa lịch chưa bắt đầu.");
      const barber = this.repo.barbers.get(input.barberId);
      const services = this.selectedServices(input.serviceId, input.serviceIds);
      const service = services[0];
      ensure(barber?.active, 404, "Thợ không hoạt động.");
      ensure(!barber.serviceIds || services.every((item) => barber.serviceIds!.includes(item.id)), 400, "Thợ không thực hiện đủ dịch vụ đã chọn.");
      ensure(/(?:Z|[+-]\d{2}:\d{2})$/.test(input.startAt), 400, "Thời gian cần chứa múi giờ.");
      const start = DateTime.fromISO(input.startAt, { setZone: true }).setZone(SHOP_ZONE);
      ensure(start.isValid && start > DateTime.now(), 400, "Ngày giờ phải ở tương lai.");
      const today = DateTime.now().setZone(SHOP_ZONE).startOf("day");
      ensure(start <= today.plus({ days: 13 }).endOf("day"), 400, "Chỉ nhận đổi lịch trong 14 ngày tới.");
      const end = start.plus({ minutes: services.reduce((total, item) => total + item.durationMinutes, 0) });
      const fitsSchedule = this.repo.schedules.all().some((schedule) => {
        if (schedule.barberId !== barber.id || schedule.date !== start.toISODate()) return false;
        const bounds = scheduleBounds(schedule);
        return start >= bounds.start && end <= bounds.end && start.second === 0 &&
          start.millisecond === 0 && start.diff(bounds.start, "minutes").minutes % 30 === 0;
      });
      ensure(fitsSchedule, 400, "Khung giờ không nằm trong lịch làm việc.");
      ensure(this.available(barber.id, start, end, id), 409, "Khung giờ đã được đặt. Vui lòng chọn giờ khác.");
      ensure(!existing.voucherCode || JSON.stringify(existing.serviceIds || [existing.serviceId]) === JSON.stringify(services.map((item) => item.id)), 409, "Hãy giữ nguyên dịch vụ khi lịch có mã giảm giá.");
      const serviceItems = services.map((item) => ({ id: item.id, name: item.name,
        price: item.promotionPrice ?? item.price, durationMinutes: item.durationMinutes }));
      const basePrice = serviceItems.reduce((total, item) => total + item.price, 0);
      const discount = this.voucherDiscount(existing.voucherCode, basePrice, start, false, existing.customerId).discount;
      const price = basePrice - discount;
      const updated: Appointment = {
        ...existing,
        barberId: barber.id,
        barberNameSnapshot: barber.name,
        serviceId: service.id,
        serviceNameSnapshot: services.map((item) => item.name).join(" + "),
        serviceIds: services.map((item) => item.id),
        serviceItems,
        priceSnapshot: price,
        ...(existing.voucherCode ? { discountAmount: discount } : {}),
        durationSnapshot: serviceItems.reduce((total, item) => total + item.durationMinutes, 0),
        startAt: start.toISO()!,
        endAt: end.toISO()!
      };
      this.repo.appointments.put(updated);
      return updated;
    });
  }

  cancel(user: User, id: string, reason: string): Appointment {
    const appointment = this.repo.appointments.get(id);

    ensure(appointment, 404, "Không tìm thấy lịch hẹn.");
    ensure(
      appointment.customerId === user.id,
      403,
      "Không có quyền hủy lịch này."
    );

    ensure(
      appointment.status === "pending" || appointment.status === "confirmed",
      409,
      "Lịch hẹn đã bắt đầu hoặc hoàn tất, vui lòng liên hệ salon."
    );
    ensure(reason.trim().length >= 3, 400, "Cần nhập lý do hủy lịch.");
    ensure(
      DateTime.fromISO(appointment.startAt).diffNow("hours").hours >= 2,
      409,
      "Chỉ có thể tự hủy trước giờ hẹn ít nhất 2 tiếng."
    );

    const updated: Appointment = {
      ...appointment,
      status: "cancelled",
      cancelReason: reason.trim()
    };

    this.repo.appointments.put(updated);
    this.releaseVoucher(appointment);
    this.repo.notifications.put({ id: randomUUID(), customerId: user.id, title: "Lịch hẹn đã được hủy",
      body: `Lịch ${appointment.serviceNameSnapshot} đã hủy. Lý do: ${reason.trim()}`,
      kind: "booking", appointmentId: appointment.id, createdAt: new Date().toISOString(), read: false });
    return updated;
  }

  changeStatus(
    id: string,
    status: AppointmentStatus,
    cancelReason?: string,
    payment?: { method: "cash" | "transfer" | "card"; amount: number }
  ): Appointment {
    const appointment = this.repo.appointments.get(id);
    ensure(appointment, 404, "Không tìm thấy lịch hẹn.");

    const allowed: Record<
      AppointmentStatus,
      AppointmentStatus[]
    > = {
      pending: ["confirmed", "cancelled", "no_show"],
      confirmed: ["in_progress", "completed", "cancelled", "no_show"],
      in_progress: ["completed", "cancelled", "no_show"],
      completed: [],
      cancelled: [],
      no_show: []
    };

    ensure(
      allowed[appointment.status].includes(status),
      409,
      "Chuyển trạng thái không hợp lệ."
    );

    if (status === "completed" && appointment.status !== "in_progress") {
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

    if (status === "in_progress" || status === "no_show") {
      ensure(DateTime.fromISO(appointment.startAt) <= DateTime.now(), 409, "Chưa đến giờ hẹn.");
    }
    if (status === "completed" && payment) {
      ensure(Number.isFinite(payment.amount) && payment.amount >= 0 && payment.amount <= appointment.priceSnapshot, 400, "Số tiền thực thu không hợp lệ.");
    }

    if (status === "cancelled") {
      ensure(cancelReason && cancelReason.trim().length >= 3, 400, "Cần nhập lý do hủy lịch (ít nhất 3 ký tự).");
    }

    const updated: Appointment = { ...appointment, status,
      ...(status === "cancelled" ? { cancelReason: cancelReason!.trim() } : {}),
      ...(status === "in_progress" ? { startedAt: new Date().toISOString() } : {}),
      ...(status === "completed" && payment ? { paymentMethod: payment.method, amountPaid: payment.amount } : {})
    };
    this.repo.appointments.put(updated);
    if (status === "cancelled" || status === "no_show") this.releaseVoucher(appointment);
    if (status === "confirmed" || status === "cancelled" || status === "no_show") {
      const title = status === "confirmed" ? "Salon đã xác nhận lịch hẹn" : status === "no_show" ? "Lịch hẹn được ghi nhận vắng mặt" : "Salon đã hủy lịch hẹn";
      this.repo.notifications.put({ id: randomUUID(), customerId: appointment.customerId, title,
        body: `${appointment.serviceNameSnapshot} · ${DateTime.fromISO(appointment.startAt).setZone(SHOP_ZONE).toFormat("HH:mm dd/MM")}${cancelReason ? ` · ${cancelReason.trim()}` : ""}`,
        kind: "booking", appointmentId: appointment.id, createdAt: new Date().toISOString(), read: false });
    }
    if (status === "completed" && !appointment.walkIn) {
      const points = Math.floor((payment?.amount || 0) / 10000);
      const customer = this.repo.users.get(appointment.customerId);
      if (customer && points) this.repo.users.put({ ...customer, loyaltyPoints: (customer.loyaltyPoints || 0) + points });
      if (points) this.repo.notifications.put({ id: randomUUID(), customerId: appointment.customerId,
        title: `Bạn nhận ${points} điểm thưởng`, body: `Số dư mới: ${(customer?.loyaltyPoints || 0) + points} điểm. Đổi 100 điểm lấy mã giảm 50.000đ.`,
        kind: "loyalty", appointmentId: appointment.id, createdAt: new Date().toISOString(), read: false });
      this.repo.notifications.put({ id: randomUUID(), customerId: appointment.customerId,
        title: "Cảm ơn bạn đã ghé tiệm", body: "Đánh giá trải nghiệm của bạn nhé!",
        kind: "review_invite", appointmentId: appointment.id, createdAt: new Date().toISOString(), read: false });
    }

    return updated;
  }
}

