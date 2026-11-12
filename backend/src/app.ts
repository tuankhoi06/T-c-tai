import express from "express";
import type {
  NextFunction,
  Request,
  Response
} from "express";
import cors from "cors";
import helmet from "helmet";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { randomInt, randomUUID } from "node:crypto";
import { z } from "zod";
import { DateTime } from "luxon";

import { config, SHOP_ZONE } from "./config.js";
import { AppError, ensure } from "./errors.js";
import {
  createToken,
  hashPassword,
  normalizePhone,
  publicUser,
  verifyPassword
} from "./security.js";
import {
  BookingService,
  appointmentCommission,
  isAppointmentPaymentConfirmed,
  scheduleBounds,
  validDate,
  overlaps
} from "./booking.js";
import {
  ConsultationService,
  preferencesSchema
} from "./ai.js";
import { registerAdminOperations } from "./admin-operations.js";
import { sendPush } from "./notifications.js";
import { appendSupportEntry, barberParticipantId, canSeeSupportThread, isStaffRole, makeSupportThread, supportEntries, supportThreadView } from "./support.js";

import type { User } from "./models.js";
import type { Repository } from "./repository.js";

type Handler = (
  req: Request,
  res: Response
) => unknown | Promise<unknown>;

function customerAppointment(appointment: import("./models.js").Appointment) {
  const { commissionAmount: _commissionAmount, commissionRateSnapshot: _commissionRateSnapshot, paymentConfirmedBy: _paymentConfirmedBy, ...visible } = appointment;
  return visible;
}

const wrap =
  (handler: Handler) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve()
      .then(() => handler(req, res))
      .catch(next);
  };
  
const phoneSchema = z.string().regex(
  /^0\d{9}$/,
  "Nhập số điện thoại Việt Nam gồm 10 chữ số, bắt đầu bằng 0."
);

const serviceSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(1000),
  price: z.number().int().min(0).max(100000000),
  durationMinutes: z.number().int().min(15).max(480),
  active: z.boolean(),
  category: z.enum(["cut", "wash", "chemical", "care", "combo"]).optional(),
  imageUrl: z.union([z.literal(""), z.string().url()]).optional(),
  process: z.string().max(2000).optional(),
  promotionPrice: z.number().int().min(0).max(100000000).nullable().optional()
});

const barberSchema = z.object({
  name: z.string().trim().min(1).max(100),
  bio: z.string().max(1000),
  imageUrl: z.union([z.literal(""), z.string().url()]),
  active: z.boolean(),
  phone: phoneSchema.optional().or(z.literal("")),
  title: z.enum(["master", "top", "junior"]).optional(),
  serviceIds: z.array(z.string()).nullable().optional(),
  commissionRate: z.number().min(0).max(100).optional()
});

const scheduleSchema = z.object({
  barberId: z.string().min(1),
  date: z.string().refine(validDate, "Ngày không hợp lệ."),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
});

export function createApp(repo: Repository) {
  const app = express();
  const booking = new BookingService(repo);
  const consultation = new ConsultationService();

  app.disable("x-powered-by");
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" }
    })
  );

  const origins = config.CORS_ORIGINS
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin: origins.length ? origins : true,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "Accept"]
    })
  );

  app.use(express.json({ limit: "400kb" }));

  if (repo.flush) {
    app.use((_req, res, next) => {
      const sendJson = res.json.bind(res);
      const endResponse = res.end.bind(res);
      const restoreResponseMethods = () => {
        res.json = sendJson;
        res.end = endResponse;
      };

      res.json = ((body: unknown) => {
        void repo.flush!().then(() => {
          restoreResponseMethods();
          sendJson(body);
        }).catch((error) => {
          restoreResponseMethods();
          next(error);
        });
        return res;
      }) as Response["json"];

      res.end = ((...args: unknown[]) => {
        void repo.flush!().then(() => {
          restoreResponseMethods();
          (endResponse as (...values: unknown[]) => Response)(...args);
        }).catch((error) => {
          restoreResponseMethods();
          next(error);
        });
        return res;
      }) as Response["end"];

      next();
    });
  }

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      storage: repo.storageType || "in-memory",
      aiMode: config.AI_MODE,
      aiProvider: consultation.status.provider
    });
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 40,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
      message: "Quá nhiều yêu cầu đăng nhập. Thử lại sau."
    }
  });

  app.post(
    "/api/auth/register",
    authLimiter,
    wrap(async (req, res) => {
      const body = z.object({
        username: z.string().trim().min(2).max(50),
        phone: z.string().trim().min(9).max(20),
        password: z.string().min(8).max(128)
      }).parse(req.body);
      const phone = phoneSchema.parse(normalizePhone(body.phone));
      const username = body.username;
      ensure(!repo.users.all().some((user) => (user.username || user.name).toLocaleLowerCase("vi-VN") === username.toLocaleLowerCase("vi-VN")), 409, "Tên đăng nhập đã được sử dụng.");
      ensure(!repo.users.byPhone(phone), 409, "Số điện thoại đã được đăng ký.");
      const passwordHash = await hashPassword(body.password);
      ensure(!repo.users.byPhone(phone), 409, "Số điện thoại đã được đăng ký.");

      const user: User = {
        id: randomUUID(),
        name: username,
        username,
        phone,
        passwordHash,
        role: "customer"
      };

      repo.users.put(user);

      const token = createToken();
      repo.sessions.put(token, {
        userId: user.id,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
      });

      res.status(201).json({
        token,
        user: publicUser(user)
      });
    })
  );

  app.post(
    "/api/auth/login",
    authLimiter,
    wrap(async (req, res) => {
      const body = z.object({
        phone: z.string().trim().min(9).max(20),
        password: z.string().min(1).max(128)
      }).parse(req.body);

      const user = repo.users.byPhone(normalizePhone(body.phone));

      ensure(
        user &&
          (await verifyPassword(
            body.password,
            user.passwordHash
          )),
        401,
        "Tài khoản hoặc mật khẩu không đúng."
      );

      const token = createToken();

      repo.sessions.put(token, {
        userId: user.id,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
      });

      res.json({
        token,
        user: publicUser(user)
      });
    })
  );

  app.post("/api/auth/forgot-password", authLimiter, wrap(async (req, res) => {
    const body = z.object({ phone: z.string().trim().min(9).max(20) }).parse(req.body);
    const phone = phoneSchema.parse(normalizePhone(body.phone));
    const user = repo.users.byPhone(phone);
    ensure(user, 404, "Không tìm thấy tài khoản dùng số điện thoại này.");
    const temporaryPassword = `Hair${String(randomInt(0, 1_000_000)).padStart(6, "0")}!`;
    repo.users.put({ ...user, passwordHash: await hashPassword(temporaryPassword) });
    res.json({ temporaryPassword, message: "Đã tạo mật khẩu tạm mới cho tài khoản." });
  }));

  app.use("/api", (req, res, next) => {
    const authorization = req.header("authorization");
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice(7)
      : "";

    const session = repo.sessions.get(token);

    if (!session || session.expiresAt <= Date.now()) {
      if (token) repo.sessions.remove(token);

      res.status(401).json({
        message: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn."
      });
      return;
    }

    const user = repo.users.get(session.userId);

    if (!user) {
      res.status(401).json({
        message: "Tài khoản không còn tồn tại."
      });
      return;
    }

    res.locals.user = user;
    res.locals.token = token;
    next();
  });

  app.post("/api/auth/logout", (_req, res) => {
    repo.sessions.remove(res.locals.token);
    res.status(204).end();
  });

  app.get("/api/me", (_req, res) => {
    res.json(publicUser(res.locals.user));
  });

  app.delete("/api/me", wrap((req, res) => {
    const user: User = res.locals.user;
    ensure(user.role === "customer", 403, "Chỉ khách hàng có thể tự xóa tài khoản.");
    for (const item of repo.appointments.all().filter((entry) => entry.customerId === user.id)) {
      const active = ["pending", "confirmed", "in_progress"].includes(item.status);
      repo.appointments.put({ ...item, ...(active ? { status: "cancelled" as const, cancelReason: "Khách đã xóa tài khoản" } : {}), customerId: "deleted", customerNameSnapshot: "Tài khoản đã xóa", customerPhoneSnapshot: undefined, note: undefined, styleName: undefined, aiHaircutName: undefined, aiBarberNote: undefined, review: undefined, reviewPhoto: undefined });
    }
    for (const item of repo.notifications.all().filter((entry) => entry.customerId === user.id)) repo.notifications.remove(item.id);
    for (const item of repo.vouchers.all().filter((entry) => entry.ownerId === user.id)) repo.vouchers.remove(item.id);
    for (const item of repo.supportMessages.all().filter((entry) => entry.customerId === user.id)) repo.supportMessages.remove(item.id);
    for (const item of repo.pushDevices.all().filter((entry) => entry.customerId === user.id)) repo.pushDevices.remove(item.id);
    repo.users.remove(user.id);
    repo.sessions.remove(res.locals.token);
    res.status(204).end();
  }));

  app.patch(
    "/api/me",
    wrap((req, res) => {
      const body = z.object({
        name: z.string().trim().min(2).max(100).optional(),
        birthday: z.string().refine(validDate, "Ngày sinh không hợp lệ.").optional()
      }).parse(req.body);
      ensure(body.name || body.birthday, 400, "Không có thông tin cần cập nhật.");

      const user: User = {
        ...res.locals.user,
        ...(body.name ? { name: body.name } : {}),
        ...(body.birthday ? { birthday: body.birthday } : {})
      };

      repo.users.put(user);
      res.json(publicUser(user));
    })
  );

  app.get("/api/services", (_req, res) => {
    res.json(
      repo.services.all().filter((service) => service.active)
    );
  });

  app.get(
    "/api/services/:id",
    wrap((req, res) => {
      const service = repo.services.get(req.params.id);
      ensure(service?.active, 404, "Không tìm thấy dịch vụ.");
      res.json(service);
    })
  );

  app.get("/api/barbers", (_req, res) => {
    res.json(
      repo.barbers.all().filter((barber) => barber.active).map((barber) => {
        const reviews = repo.appointments.all().filter((item) => item.barberId === barber.id && item.rating);
        return { ...barber, reviewCount: reviews.length,
          ratingAverage: reviews.length ? Math.round(reviews.reduce((total, item) => total + (item.rating || 0), 0) * 10 / reviews.length) / 10 : null,
          portfolio: repo.appointments.all().filter((item) => item.barberId === barber.id && item.status === "completed" && item.portfolioConsent && (item.styleName || item.reviewPhoto))
            .sort((a, b) => b.startAt.localeCompare(a.startAt)).slice(0, 4)
            .map((item) => ({ styleName: item.styleName || item.serviceNameSnapshot, ...(item.reviewPhoto ? { photo: item.reviewPhoto } : {}), ...(item.rating ? { rating: item.rating } : {}) })) };
      })
    );
  });

  app.get(
    "/api/availability",
    wrap((req, res) => {
      const query = z.object({
        barberId: z.string().min(1),
        serviceId: z.string().min(1),
        serviceIds: z.string().optional(),
        date: z.string()
      }).parse(req.query);

      res.json(
        booking.availability(
          query.barberId,
          query.serviceId,
          query.date,
          query.serviceIds?.split(",")
        )
      );
    })
  );

  function customerOnly(
    _req: Request,
    res: Response,
    next: NextFunction
  ) {
    if (res.locals.user.role !== "customer") {
      res.status(403).json({
        message: "Chức năng này dành cho khách hàng."
      });
      return;
    }

    next();
  }

  app.post(
    "/api/appointments",
    customerOnly,
    wrap(async (req, res) => {
      const body = z.object({
        barberId: z.string().min(1),
        serviceId: z.string().min(1),
        serviceIds: z.array(z.string().min(1)).min(1).max(5).optional(),
        startAt: z.string().min(1),
        note: z.string().trim().max(500).optional(),
        styleName: z.string().trim().max(100).optional(),
        paymentChoice: z.enum(["salon", "prepay"]).optional(),
        voucherCode: z.string().trim().max(30).optional(),
        aiSuggestion: z.object({
          haircutName: z.string().trim().min(1).max(100),
          barberNote: z.string().trim().min(1).max(500)
        }).optional()
      }).parse(req.body);

      const appointment = await booking.create(res.locals.user, body);
      const notice = repo.notifications.all().find((item) => item.kind === "booking" && item.appointmentId === appointment.id);
      if (notice) void sendPush(repo, [notice]);
      res.status(201).json(appointment);
    })
  );

  app.get(
    "/api/appointments/me",
    customerOnly,
    (_req, res) => {
      res.json(
        repo.appointments.all()
          .filter(
            (appointment) =>
              appointment.customerId === res.locals.user.id
          )
          .sort((a, b) => b.startAt.localeCompare(a.startAt))
          .map(customerAppointment)
      );
    }
  );

  app.post("/api/appointments/:id/simulate-payment", customerOnly, wrap((req, res) => {
    const appointment = repo.appointments.get(req.params.id);
    ensure(appointment && appointment.customerId === res.locals.user.id, 404, "Không tìm thấy lịch hẹn.");
    ensure(appointment.paymentChoice === "prepay" && ["pending", "confirmed"].includes(appointment.status), 409, "Lịch này không chờ thanh toán mô phỏng.");
    ensure(!appointment.simulatedPaid, 409, "Lịch đã được thanh toán mô phỏng.");
    const amount = appointment.depositRequired || appointment.priceSnapshot;
    const updated = { ...appointment, simulatedPaid: amount, simulatedPaymentReference: `DEMO-${appointment.id.slice(0, 8).toUpperCase()}` };
    repo.appointments.put(updated);
    res.json(updated);
  }));

  app.get(
    "/api/appointments/:id",
    wrap((req, res) => {
      const appointment = repo.appointments.get(req.params.id);

      ensure(appointment, 404, "Không tìm thấy lịch hẹn.");

      ensure(
        res.locals.user.role === "admin" ||
          appointment.customerId === res.locals.user.id,
        403,
        "Không có quyền xem lịch này."
      );

      res.json(res.locals.user.role === "admin" ? appointment : customerAppointment(appointment));
    })
  );

  app.patch(
    "/api/appointments/:id/cancel",
    customerOnly,
    wrap((req, res) => {
      const { reason } = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.body);
      const updated = booking.cancel(res.locals.user, req.params.id, reason);
      const notice = repo.notifications.all().find((item) => item.appointmentId === updated.id && item.kind === "booking" && item.title === "Lịch hẹn đã được hủy");
      if (notice) void sendPush(repo, [notice]);
      res.json(customerAppointment(updated));
    })
  );

  app.patch("/api/appointments/:id/reschedule", customerOnly, wrap(async (req, res) => {
    const existing = repo.appointments.get(req.params.id);
    ensure(existing && existing.customerId === res.locals.user.id, 404, "Không tìm thấy lịch hẹn.");
    ensure(DateTime.fromISO(existing.startAt).diffNow("hours").hours >= 2, 409, "Chỉ có thể đổi lịch trước giờ hẹn ít nhất 2 tiếng.");
    const { barberId, startAt } = z.object({ barberId: z.string().min(1), startAt: z.string().min(1) }).parse(req.body);
    const updated = await booking.reschedule(existing.id, { barberId, startAt,
      serviceId: existing.serviceId, serviceIds: existing.serviceIds });
    const pending = { ...updated, status: "pending" as const };
    repo.appointments.put(pending);
    const notice = { id: randomUUID(), customerId: pending.customerId, title: "Đã gửi yêu cầu đổi giờ",
      body: `Giờ mới: ${DateTime.fromISO(pending.startAt).setZone(SHOP_ZONE).toFormat("HH:mm dd/MM")}. Đang chờ salon xác nhận.`,
      kind: "booking" as const, appointmentId: pending.id, createdAt: new Date().toISOString(), read: false };
    repo.notifications.put(notice); void sendPush(repo, [notice]);
    res.json(customerAppointment(pending));
  }));

  app.post("/api/appointments/:id/review", customerOnly, wrap((req, res) => {
    const appointment = repo.appointments.get(req.params.id);
    ensure(appointment && appointment.customerId === res.locals.user.id, 404, "Không tìm thấy lịch hẹn.");
    ensure(appointment.status === "completed", 409, "Chỉ đánh giá lịch đã hoàn thành.");
    ensure(!appointment.rating, 409, "Lịch này đã được đánh giá.");
    const body = z.object({ rating: z.number().int().min(1).max(5), review: z.string().trim().max(500).optional(),
      photo: z.string().regex(/^data:image\/(jpeg|png);base64,/).max(350000).optional(), portfolioConsent: z.boolean().optional() }).parse(req.body);
    const updated = { ...appointment, rating: body.rating, review: body.review, reviewPhoto: body.photo, portfolioConsent: body.portfolioConsent === true };
    repo.appointments.put(updated); res.json(customerAppointment(updated));
  }));

  app.get("/api/vouchers/me", customerOnly, (_req, res) => {
    const today = DateTime.now().setZone(SHOP_ZONE).toISODate()!;
    res.json(repo.vouchers.all().filter((item) => item.active && item.to >= today && item.usedCount < item.maxUses &&
      (!item.ownerId || item.ownerId === res.locals.user.id)));
  });

  app.post("/api/loyalty/redeem", customerOnly, wrap((_req, res) => {
    const user: User = res.locals.user;
    ensure((user.loyaltyPoints || 0) >= 100, 409, "Cần 100 điểm để đổi mã giảm 50.000đ.");
    const now = DateTime.now().setZone(SHOP_ZONE);
    const voucher = { id: randomUUID(), code: `DIEM${randomUUID().slice(0, 8).toUpperCase()}`,
      kind: "fixed" as const, value: 50000, maxUses: 1, usedCount: 0,
      from: now.toISODate()!, to: now.plus({ days: 30 }).toISODate()!, active: true, ownerId: user.id };
    repo.vouchers.put(voucher);
    const updated = { ...user, loyaltyPoints: (user.loyaltyPoints || 0) - 100 };
    repo.users.put(updated);
    res.status(201).json({ voucher, user: publicUser(updated) });
  }));

  app.get("/api/support/messages/me", (_req, res) => {
    ensure(["customer", "barber"].includes(res.locals.user.role), 403, "Chỉ khách hàng và thợ mới có thể xem thư hỗ trợ.");
    const viewer: User = res.locals.user;
    res.json(repo.supportMessages.all().filter((item) => canSeeSupportThread(item, viewer))
      .map((item) => supportThreadView(item, repo, viewer.id)).sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)));
  });
  app.get("/api/messaging/contacts", (_req, res) => {
    const viewer: User = res.locals.user;
    ensure(["customer", "admin", "barber"].includes(viewer.role), 403, "Không có quyền xem danh bạ.");
    const threads = repo.supportMessages.all();
    const admin = repo.users.all().find((user) => user.role === "admin");
    const threadFor = (targetId: string, targetRole: "admin" | "barber" | "customer") => {
      const targetParticipant = targetRole === "barber" ? barberParticipantId(targetId) : targetId;
      const viewerParticipant = viewer.role === "barber" && viewer.barberId ? barberParticipantId(viewer.barberId) : viewer.id;
      return threads.find((item) => {
        if (viewer.role === "customer") {
          if (item.customerId !== viewer.id) return false;
          if (targetRole === "admin") return item.contactRole !== "barber" &&
            (item.contactId === targetId || item.participantIds?.includes(targetId) || !item.contactId);
          return (item.contactId === targetId && item.contactRole === "barber") ||
            supportEntries(item).some((entry) => entry.senderRole === "barber" && repo.users.get(entry.senderId)?.barberId === targetId);
        }
        const participants = item.participantIds || [];
        const recipient = item.contactRole === "barber" && item.contactId === targetId || item.contactId === targetId;
        return (participants.includes(viewerParticipant) || supportEntries(item).some((entry) => entry.senderId === viewer.id)) &&
          (participants.includes(targetParticipant) || supportEntries(item).some((entry) => entry.senderId === targetId) || recipient);
      });
    };
    const contacts: Array<{ id: string; name: string; phone?: string; role: "admin" | "barber"; barberId?: string; conversationId?: string; canMessage: boolean }> = [];
    if (viewer.role === "customer") {
      if (admin) {
        const thread = threadFor(admin.id, "admin");
        contacts.push({ id: admin.id, name: admin.name, phone: admin.phone, role: "admin", conversationId: thread?.id, canMessage: true });
      }
      for (const barber of repo.barbers.all().filter((item) => item.active).sort((a, b) => a.name.localeCompare(b.name, "vi"))) {
        const account = repo.users.all().find((user) => user.role === "barber" && user.barberId === barber.id);
        const thread = threadFor(barber.id, "barber");
        const hasStaffStarted = !!thread && supportEntries(thread).some((entry) => entry.senderRole === "barber" &&
          (entry.senderId === account?.id || repo.users.get(entry.senderId)?.barberId === barber.id));
        contacts.push({ id: barber.id, name: barber.name, phone: account?.phone || barber.phone, role: "barber", barberId: barber.id,
          conversationId: thread?.id, canMessage: hasStaffStarted });
      }
    } else {
      if (viewer.role === "barber" && admin) {
        const thread = threadFor(admin.id, "admin");
        contacts.push({ id: admin.id, name: admin.name, phone: admin.phone, role: "admin", conversationId: thread?.id, canMessage: true });
      }
      for (const barber of repo.barbers.all().filter((item) => item.active && (viewer.role === "admin" || item.id !== viewer.barberId)).sort((a, b) => a.name.localeCompare(b.name, "vi"))) {
        const account = repo.users.all().find((user) => user.role === "barber" && user.barberId === barber.id);
        const thread = threadFor(barber.id, "barber");
        contacts.push({ id: barber.id, name: barber.name, phone: account?.phone || barber.phone, role: "barber", barberId: barber.id,
          conversationId: thread?.id, canMessage: true });
      }
    }
    res.json(contacts);
  });
  const unreadSupportCounts = (viewer: User) => {
    const viewerParticipant = viewer.role === "barber" && viewer.barberId ? barberParticipantId(viewer.barberId) : viewer.id;
    const visible = repo.supportMessages.all().filter((item) => canSeeSupportThread(item, viewer));
    const pendingLeaveCount = viewer.role === "admin" ? visible.filter((item) => !!item.leaveRequestId && item.leaveRequestStatus === "pending").length : 0;
    const count = visible.filter((item) => {
      if (viewer.role === "admin" && item.leaveRequestId && item.leaveRequestStatus === "pending") return false;
      const entries = supportEntries(item);
      const latest = entries[entries.length - 1];
      return !!latest && latest.senderId !== viewer.id && latest.senderId !== viewerParticipant &&
        !item.readBy?.includes(viewer.id) && !item.readBy?.includes(viewerParticipant);
    }).length;
    return { count, pendingLeaveCount };
  };
  app.get("/api/messages/unread-count", (_req, res) => {
    res.json(unreadSupportCounts(res.locals.user));
  });
  app.post("/api/messages/read-all", (_req, res) => {
    const viewer: User = res.locals.user;
    const viewerParticipant = viewer.role === "barber" && viewer.barberId ? barberParticipantId(viewer.barberId) : viewer.id;
    let markedCount = 0;
    for (const item of repo.supportMessages.all().filter((thread) => canSeeSupportThread(thread, viewer))) {
      if (viewer.role === "admin" && item.leaveRequestId && item.leaveRequestStatus === "pending") continue;
      const entries = supportEntries(item);
      const latest = entries[entries.length - 1];
      if (!latest || latest.senderId === viewer.id || latest.senderId === viewerParticipant ||
          item.readBy?.includes(viewer.id) || item.readBy?.includes(viewerParticipant)) continue;
      repo.supportMessages.put({ ...item, readBy: [...new Set([...(item.readBy || []), viewer.id, viewerParticipant])] });
      markedCount += 1;
    }
    res.json({ markedCount, ...unreadSupportCounts(viewer) });
  });
  app.post("/api/messages/:threadId/read", wrap((req, res) => {
    const viewer: User = res.locals.user;
    const item = repo.supportMessages.get(req.params.threadId);
    ensure(item && canSeeSupportThread(item, viewer), 404, "Không tìm thấy cuộc trò chuyện.");
    const viewerParticipant = viewer.role === "barber" && viewer.barberId ? barberParticipantId(viewer.barberId) : viewer.id;
    repo.supportMessages.put({ ...item, readBy: [...new Set([...(item.readBy || []), viewer.id, viewerParticipant])] });
    res.status(204).end();
  }));
  app.post("/api/support/messages", wrap((req, res) => {
    const sender: User = res.locals.user;
    ensure(sender.role === "customer", 403, "Khách hàng chỉ có thể mở thư hỗ trợ với salon tại đây.");
    const { body } = z.object({ body: z.string().trim().min(2).max(500) }).parse(req.body);
    const admin = repo.users.all().find((user) => user.role === "admin");
    ensure(admin, 503, "Hiện chưa có tài khoản hỗ trợ của salon.");
    const existing = repo.supportMessages.all().find((item) => item.customerId === sender.id && item.contactRole !== "barber" &&
      (item.contactId === admin.id || item.participantIds?.includes(admin.id) || !item.contactId ||
        supportEntries(item).some((entry) => entry.senderRole === "admin")));
    const message = existing ? appendSupportEntry(existing, sender, body) :
      makeSupportThread({ customerId: sender.id, sender, recipient: admin, contactId: admin.id, contactRole: "admin", body });
    repo.supportMessages.put(message); res.status(201).json(supportThreadView(message, repo, sender.id));
  }));
  app.get("/api/customers/search", (req, res) => {
    ensure(isStaffRole(res.locals.user.role), 403, "Chỉ admin và thợ mới được tìm hồ sơ khách hàng.");
    const { q } = z.object({ q: z.string().trim().max(100).optional() }).parse(req.query);
    const query = (q || "").toLocaleLowerCase("vi-VN");
    if (query.length < 2) { res.json([]); return; }
    res.json(repo.users.all().filter((user) => user.role === "customer" &&
      [user.name, user.username || "", user.phone || ""].some((value) => value.toLocaleLowerCase("vi-VN").includes(query)))
      .slice(0, 20).map(({ id, name, username, phone, blacklisted }) => ({ id, name, username, phone, blacklisted })));
  });
  app.post("/api/messages", wrap((req, res) => {
    const sender: User = res.locals.user;
    ensure(isStaffRole(sender.role), 403, "Chỉ admin và thợ mới có thể chủ động gửi tin nhắn.");
    const body = z.object({ recipientId: z.string().min(1).optional(), customerId: z.string().min(1).optional(), message: z.string().trim().min(2).max(500), appointmentId: z.string().optional() })
      .refine((value) => value.recipientId || value.customerId, "Cần chọn người nhận tin nhắn.").parse(req.body);
    const recipientId = body.recipientId || body.customerId!;
    const userRecipient = repo.users.get(recipientId);
    const barberProfile = userRecipient?.role === "barber" ? repo.barbers.get(userRecipient.barberId || "") : repo.barbers.get(recipientId);
    let recipient: User | { id: string; role: "barber"; name: string; phone?: string; barberId: string };
    let contactId = recipientId;
    let contactRole: "customer" | "admin" | "barber";
    if (barberProfile) {
      ensure(barberProfile.active, 404, "Thợ này hiện không còn hoạt động.");
      ensure(sender.role !== "barber" || sender.barberId !== barberProfile.id, 400, "Không thể tự nhắn cho chính mình.");
      const account = repo.users.all().find((user) => user.role === "barber" && user.barberId === barberProfile.id);
      recipient = account || { id: barberParticipantId(barberProfile.id), role: "barber", name: barberProfile.name, barberId: barberProfile.id };
      contactId = barberProfile.id; contactRole = "barber";
    } else {
      ensure(userRecipient && (userRecipient.role === "customer" || userRecipient.role === "admin"), 404, "Không tìm thấy người nhận tin nhắn.");
      recipient = userRecipient; contactId = userRecipient.id; contactRole = userRecipient.role;
      if (userRecipient.role === "customer" && body.appointmentId) {
        const appointment = repo.appointments.get(body.appointmentId);
        ensure(appointment && appointment.customerId === userRecipient.id, 404, "Lịch hẹn không thuộc khách hàng này.");
        if (sender.role === "barber") ensure(appointment.barberId === sender.barberId, 403, "Thợ chỉ được liên hệ khách trong lịch của mình.");
      }
    }
    if (body.appointmentId && recipient.role !== "customer") throw new AppError(400, "Lịch hẹn liên hệ chỉ áp dụng cho khách hàng.");
    const customerId = recipient.role === "customer" ? recipient.id : undefined;
    const senderIdentity = sender.role === "barber" && sender.barberId ? barberParticipantId(sender.barberId) : sender.id;
    const recipientIdentity = recipient.role === "barber" && recipient.barberId ? barberParticipantId(recipient.barberId) : recipient.id;
    const existing = repo.supportMessages.all().find((item) => (item.participantIds || []).includes(senderIdentity) &&
      (item.participantIds || []).includes(recipientIdentity));
    const thread = existing ? appendSupportEntry(existing, sender, body.message) :
      makeSupportThread({ sender, recipient, customerId, contactId, contactRole, body: body.message, appointmentId: body.appointmentId });
    repo.supportMessages.put(thread);
    if (customerId) repo.notifications.put({ id: randomUUID(), customerId, title: "Tin nhắn mới từ salon", body: body.message,
      kind: "manual", createdAt: new Date().toISOString(), read: false });
    res.status(201).json(supportThreadView(thread, repo, sender.id));
  }));
  app.post("/api/messages/:threadId/reply", wrap((req, res) => {
    const sender: User = res.locals.user;
    const item = repo.supportMessages.get(req.params.threadId);
    ensure(item, 404, "Không tìm thấy cuộc trò chuyện.");
    const { body } = z.object({ body: z.string().trim().min(2).max(500) }).parse(req.body);
    const entries = supportEntries(item);
    if (sender.role === "customer") {
      ensure(item.customerId === sender.id, 403, "Bạn không thuộc cuộc trò chuyện này.");
      ensure(entries.some((entry) => entry.senderRole === "barber" || entry.senderRole === "admin"),
        403, "Bạn chỉ có thể trả lời sau khi thợ hoặc admin đã nhắn trước.");
    } else {
      ensure(canSeeSupportThread(item, sender), 403, "Bạn không thuộc cuộc trò chuyện này.");
    }
    const updated = appendSupportEntry(item, sender, body);
    repo.supportMessages.put(updated);
    if (sender.role !== "customer" && item.customerId) repo.notifications.put({ id: randomUUID(), customerId: item.customerId,
      title: "Salon đã trả lời", body, kind: "manual", createdAt: new Date().toISOString(), read: false });
    res.json(supportThreadView(updated, repo, sender.id));
  }));

  const aiLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 8,
    keyGenerator: (_req, res) => res.locals.user.id,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
      message: "Bạn đã dùng hết 8 lượt tư vấn trong 10 phút. Vui lòng đợi một lúc rồi thử lại."
    }
  });

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 5 * 1024 * 1024,
      files: 1,
      fields: 2,
      fieldSize: 10000,
      parts: 3
    }
  });

  app.post(
    "/api/ai/consultations",
    customerOnly,
    upload.single("image"),
    aiLimiter,
    wrap(async (req, res) => {
      ensure(
        req.body.consent === "true",
        400,
        "Cần đồng ý gửi ảnh để sử dụng chức năng."
      );

      ensure(req.file, 400, "Chưa có ảnh.");

      let preferences: unknown = {};

      if (req.body.preferences) {
        try {
          preferences =
            typeof req.body.preferences === "string"
              ? JSON.parse(req.body.preferences)
              : req.body.preferences;
        } catch {
          preferences = {};
        }
      }

      const parsed = preferencesSchema.parse(preferences);

      try {
        res.json(
          await consultation.consult(
            req.file.buffer,
            parsed
          )
        );
      } finally {
        // Không ghi ảnh ra ổ đĩa. Xóa tham chiếu buffer sau xử lý.
        req.file.buffer = Buffer.alloc(0);
      }
    })
  );

  app.get("/api/barber/today", wrap((_req, res) => {
    const user: User = res.locals.user;
    ensure(user.role === "barber" && user.barberId, 403, "Chỉ thợ được xem lịch cá nhân.");
    const today = DateTime.now().setZone(SHOP_ZONE).toISODate()!;
    const month = today.slice(0, 7);
    const own = repo.appointments.all().filter((item) => item.barberId === user.barberId);
    const done = own.filter((item) => item.status === "completed");
    const rate = (repo.barbers.get(user.barberId)?.commissionRate || 0) / 100;
    const todayDone = done.filter((item) => DateTime.fromISO(item.startAt).setZone(SHOP_ZONE).toISODate() === today);
    const monthDone = done.filter((item) => DateTime.fromISO(item.startAt).setZone(SHOP_ZONE).toISODate()?.startsWith(month));
    res.json({ appointments: own.filter((item) => DateTime.fromISO(item.startAt).setZone(SHOP_ZONE).toISODate() === today).sort((a, b) => a.startAt.localeCompare(b.startAt))
      .map((item) => {
        const customer = repo.users.get(item.customerId);
        return { id: item.id, customerNameSnapshot: item.customerNameSnapshot, serviceNameSnapshot: item.serviceNameSnapshot,
          startAt: item.startAt, endAt: item.endAt, status: item.status, aiHaircutName: item.aiHaircutName,
          aiBarberNote: item.aiBarberNote, styleName: item.styleName, note: item.note,
          ...(customer?.role === "customer" ? { customerId: customer.id, customerPhoneSnapshot: item.customerPhoneSnapshot || customer.phone } : {}) };
      }),
      todayCount: todayDone.length, monthCount: monthDone.length,
      todayCommission: todayDone.filter(isAppointmentPaymentConfirmed).reduce((sum, item) => sum + appointmentCommission(item, rate * 100), 0),
      monthCommission: monthDone.filter(isAppointmentPaymentConfirmed).reduce((sum, item) => sum + appointmentCommission(item, rate * 100), 0) });
  }));

  app.get("/api/barber/appointments", wrap((req, res) => {
    const user: User = res.locals.user;
    ensure(user.role === "barber" && user.barberId, 403, "Chỉ thợ được xem lịch cá nhân.");
    const today = DateTime.now().setZone(SHOP_ZONE).toISODate()!;
    const query = z.object({ from: z.string().refine(validDate).optional(), to: z.string().refine(validDate).optional() }).parse(req.query);
    const from = query.from || today;
    const to = query.to || DateTime.now().setZone(SHOP_ZONE).plus({ days: 13 }).toISODate()!;
    ensure(from <= to && DateTime.fromISO(to).diff(DateTime.fromISO(from), "days").days <= 31, 400, "Khoảng ngày tối đa 32 ngày.");
    const rate = (repo.barbers.get(user.barberId)?.commissionRate || 0) / 100;
    res.json(repo.appointments.all().filter((item) => item.barberId === user.barberId)
      .filter((item) => { const date = DateTime.fromISO(item.startAt).setZone(SHOP_ZONE).toISODate()!; return date >= from && date <= to; })
      .sort((a, b) => a.startAt.localeCompare(b.startAt))
      .map((item) => ({ id: item.id, customerNameSnapshot: item.customerNameSnapshot, serviceNameSnapshot: item.serviceNameSnapshot,
        startAt: item.startAt, endAt: item.endAt, status: item.status, aiHaircutName: item.aiHaircutName,
        aiBarberNote: item.aiBarberNote, styleName: item.styleName, note: item.note,
        ...(repo.users.get(item.customerId)?.role === "customer" ? { customerId: item.customerId, customerPhoneSnapshot: item.customerPhoneSnapshot || repo.users.get(item.customerId)?.phone } : {}),
        commission: item.status === "completed" && isAppointmentPaymentConfirmed(item) ? appointmentCommission(item, rate * 100) : 0 })));
  }));

  app.get("/api/barber/work-schedules", wrap((req, res) => {
    const user: User = res.locals.user;
    ensure(user.role === "barber" && user.barberId, 403, "Chỉ thợ được xem ca làm của mình.");
    const today = DateTime.now().setZone(SHOP_ZONE).toISODate()!;
    const query = z.object({ from: z.string().refine(validDate).optional(), to: z.string().refine(validDate).optional() }).parse(req.query);
    const from = query.from || today;
    const to = query.to || DateTime.now().setZone(SHOP_ZONE).plus({ days: 13 }).toISODate()!;
    ensure(from <= to && DateTime.fromISO(to).diff(DateTime.fromISO(from), "days").days <= 31, 400, "Khoảng ngày tối đa 32 ngày.");
    const activeStatuses = new Set(["pending", "confirmed", "in_progress"]);
    res.json(repo.schedules.all().filter((item) => item.barberId === user.barberId && item.date >= from && item.date <= to)
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
      .map((item) => ({ ...item, activeAppointmentCount: repo.appointments.all().filter((appointment) => {
        if (appointment.barberId !== user.barberId || !activeStatuses.has(appointment.status)) return false;
        const start = DateTime.fromISO(appointment.startAt).setZone(SHOP_ZONE);
        const end = DateTime.fromISO(appointment.endAt).setZone(SHOP_ZONE);
        return start.toISODate() === item.date && start.toFormat("HH:mm") < item.endTime && end.toFormat("HH:mm") > item.startTime;
      }).length })));
  }));

  app.get("/api/barber/profile", wrap((_req, res) => {
    const user: User = res.locals.user;
    ensure(user.role === "barber" && user.barberId, 403, "Chỉ thợ được xem hồ sơ nghề nghiệp.");
    const barber = repo.barbers.get(user.barberId);
    ensure(barber, 404, "Không tìm thấy hồ sơ thợ.");
    res.json({ id: barber.id, name: barber.name, bio: barber.bio, imageUrl: barber.imageUrl, title: barber.title,
      commissionRate: barber.commissionRate || 0,
      serviceNames: (barber.serviceIds || []).map((id) => repo.services.get(id)?.name).filter(Boolean) });
  }));

  app.get("/api/barber/leaves", wrap((_req, res) => {
    const user: User = res.locals.user;
    ensure(user.role === "barber" && user.barberId, 403, "Chỉ thợ được xem đơn nghỉ của mình.");
    res.json(repo.leaves.all().filter((leave) => leave.barberId === user.barberId).sort((a, b) => b.from.localeCompare(a.from)));
  }));

  app.post("/api/barber/leaves", wrap((req, res) => {
    const user: User = res.locals.user;
    ensure(user.role === "barber" && user.barberId, 403, "Chỉ thợ được gửi đơn nghỉ.");
    const body = z.object({ from: z.string().refine(validDate), to: z.string().refine(validDate), reason: z.string().trim().min(2).max(300) }).parse(req.body);
    const today = DateTime.now().setZone(SHOP_ZONE).toISODate()!;
    ensure(body.from >= today && body.from <= body.to, 400, "Ngày nghỉ phải từ hôm nay trở đi và ngày bắt đầu không sau ngày kết thúc.");
    ensure(!repo.leaves.all().some((leave) => leave.barberId === user.barberId && leave.status !== "rejected" && leave.from <= body.to && leave.to >= body.from), 409, "Khoảng ngày này đã có đơn nghỉ đang chờ hoặc được duyệt.");
    const admin = repo.users.all().find((candidate) => candidate.role === "admin");
    ensure(admin, 503, "Chưa có tài khoản quản trị để nhận đơn xin nghỉ.");
    const leave = { id: randomUUID(), barberId: user.barberId, ...body, status: "pending" as const };
    repo.leaves.put(leave);
    const thread = {
      ...makeSupportThread({ sender: user, recipient: admin, contactId: admin.id, contactRole: "admin", body: `Đơn xin nghỉ ${body.from} → ${body.to}\nLý do: ${body.reason}` }),
      leaveRequestId: leave.id, leaveRequestStatus: leave.status, leaveFrom: leave.from, leaveTo: leave.to, leaveReason: leave.reason
    };
    repo.supportMessages.put(thread);
    res.status(201).json(leave);
  }));

  app.patch("/api/barber/appointments/:id/status", wrap((req, res) => {
    const user: User = res.locals.user;
    ensure(user.role === "barber" && user.barberId, 403, "Chỉ thợ được cập nhật ca cá nhân.");
    const item = repo.appointments.get(req.params.id);
    ensure(item && item.barberId === user.barberId, 404, "Không tìm thấy ca của bạn.");
    ensure(DateTime.fromISO(item.startAt).setZone(SHOP_ZONE).toISODate() === DateTime.now().setZone(SHOP_ZONE).toISODate(), 409, "Chỉ cập nhật ca hôm nay.");
    const { status } = z.object({ status: z.enum(["in_progress", "completed"]) }).parse(req.body);
    const updated = booking.changeStatus(item.id, status);
    const kinds = status === "completed" ? ["review_invite"] : ["booking"];
    const notices = repo.notifications.all().filter((notice) => notice.appointmentId === updated.id && kinds.includes(notice.kind));
    if (notices.length) void sendPush(repo, notices);
    res.json({ id: updated.id, status: updated.status,
      ...(status === "completed" ? { commission: appointmentCommission(updated, repo.barbers.get(user.barberId)?.commissionRate || 0) } : {}) });
  }));

  app.use(
    "/api/admin",
    (_req, res, next) => {
      if (res.locals.user.role !== "admin") {
        res.status(403).json({
          message: "Không có quyền quản trị."
        });
        return;
      }

      next();
    }
  );

  app.get("/api/admin/settings", (_req, res) => {
    res.json({ autoCancelUnconfirmed: repo.adminSettings.get("global")?.autoCancelUnconfirmed ?? true });
  });

  app.patch("/api/admin/settings", wrap((req, res) => {
    const body = z.object({ autoCancelUnconfirmed: z.boolean() }).parse(req.body);
    repo.adminSettings.put({ id: "global", autoCancelUnconfirmed: body.autoCancelUnconfirmed });
    res.json(body);
  }));

  const barberAccountView = (user: User) => {
    const barber = repo.barbers.get(user.barberId || "");
    return {
      id: user.id,
      phone: user.phone || barber?.phone || "",
      barberId: user.barberId || "",
      name: barber?.name || user.name,
      barberName: barber?.name || user.name,
      barberTitle: barber?.title,
      barberActive: barber?.active ?? false,
      barberImageUrl: barber?.imageUrl || ""
    };
  };

  app.get("/api/admin/barber-accounts", (_req, res) => {
    res.json(repo.users.all().filter((user) => user.role === "barber").map(barberAccountView));
  });

  app.post("/api/admin/barber-accounts", wrap(async (req, res) => {
    const body = z.object({ barberId: z.string().trim().min(1), phone: z.string().trim().min(9).max(20), password: z.string().min(8).max(128) }).parse(req.body);
    const barber = repo.barbers.get(body.barberId);
    ensure(barber, 404, "Không tìm thấy hồ sơ thợ.");
    const phone = phoneSchema.parse(normalizePhone(body.phone));
    ensure(!repo.users.byPhone(phone), 409, "Số điện thoại này đã được tài khoản khác sử dụng.");
    ensure(!repo.users.all().some((item) => item.role === "barber" && item.barberId === body.barberId), 409, "Thợ này đã có tài khoản đăng nhập.");
    const user: User = { id: randomUUID(), name: barber.name, phone, passwordHash: await hashPassword(body.password), role: "barber", barberId: barber.id };
    repo.users.put(user);
    if (barber.phone !== phone) repo.barbers.put({ ...barber, phone });
    res.status(201).json(barberAccountView(user));
  }));

  app.patch("/api/admin/barber-accounts/:id", wrap(async (req, res) => {
    const existing = repo.users.get(req.params.id);
    ensure(existing?.role === "barber", 404, "Không tìm thấy tài khoản thợ.");
    const body = z.object({
      phone: z.string().trim().min(9).max(20).optional(),
      password: z.string().min(8).max(128).optional()
    }).parse(req.body);
    ensure(body.phone !== undefined || body.password !== undefined, 400, "Không có thông tin nào để cập nhật.");
    const phone = body.phone ? phoneSchema.parse(normalizePhone(body.phone)) : undefined;
    if (phone) ensure(!repo.users.byPhone(phone) || repo.users.byPhone(phone)?.id === existing.id, 409, "Số điện thoại này đã được tài khoản khác sử dụng.");
    const barber = repo.barbers.get(existing.barberId || "");
    const updated: User = {
      ...existing,
      ...(phone ? { phone } : {}),
      ...(body.password ? { passwordHash: await hashPassword(body.password) } : {}),
      ...(barber ? { name: barber.name } : {})
    };
    repo.users.put(updated);
    if (barber && phone && barber.phone !== phone) repo.barbers.put({ ...barber, phone });
    res.json(barberAccountView(updated));
  }));

  app.delete("/api/admin/barber-accounts/:id", wrap((req, res) => {
    const account = repo.users.get(req.params.id);
    ensure(account?.role === "barber", 404, "Không tìm thấy tài khoản thợ.");
    repo.users.remove(account.id);
    for (const notice of repo.notifications.all().filter((item) => item.customerId === account.id)) repo.notifications.remove(notice.id);
    for (const device of repo.pushDevices.all().filter((item) => item.customerId === account.id)) repo.pushDevices.remove(device.id);
    res.status(204).end();
  }));

  app.get(
    "/api/admin/appointments",
    wrap((req, res) => {
      const query = z.object({
        date: z.string().refine(validDate).optional(),
        from: z.string().refine(validDate).optional(),
        to: z.string().refine(validDate).optional(),
        barberId: z.string().optional(),
        q: z.string().trim().max(100).optional(),
        status: z.enum([
          "pending",
          "confirmed",
          "in_progress",
          "completed",
          "cancelled",
          "no_show"
        ]).optional()
      }).parse(req.query);
      ensure(!query.from || !query.to || query.from <= query.to, 400, "Khoảng ngày không hợp lệ.");
      const search = query.q?.toLocaleLowerCase("vi-VN");

      const appointments = repo.appointments.all()
        .filter((appointment) => {
          const date = DateTime
            .fromISO(appointment.startAt)
            .setZone(SHOP_ZONE)
            .toISODate();

          return (
            (!query.date || date === query.date) &&
            (!query.from || (date !== null && date >= query.from)) &&
            (!query.to || (date !== null && date <= query.to)) &&
            (!query.barberId || appointment.barberId === query.barberId) &&
            (!search || [appointment.id, appointment.customerNameSnapshot, appointment.customerPhoneSnapshot || ""]
              .some((value) => value.toLocaleLowerCase("vi-VN").includes(search))) &&
            (!query.status ||
              appointment.status === query.status)
          );
        })
        .sort((a, b) => a.startAt.localeCompare(b.startAt));

      res.json(appointments);
    })
  );

  const adminCustomer = (user: User) => ({ id: user.id, name: user.name, username: user.username, phone: user.phone, role: user.role,
    internalNote: user.internalNote, blacklisted: user.blacklisted, hairHistory: user.hairHistory, birthday: user.birthday,
    loyaltyPoints: user.loyaltyPoints || 0, noShowCount: user.noShowCount || 0 });
  app.get("/api/admin/customers", (_req, res) => {
    res.json(repo.users.all().filter((user) => user.role === "customer").map(adminCustomer));
  });

  const customerFields = z.object({
    name: z.string().trim().min(2).max(100),
    phone: z.string().trim().min(9).max(20)
  });

  function uniqueCustomerPhone(phone: string | undefined, exceptId?: string) {
    if (phone) ensure(!repo.users.all().some((user) => user.id !== exceptId && user.phone && normalizePhone(user.phone) === phone), 409, "Số điện thoại đã được sử dụng.");
  }

  app.post("/api/admin/customers", wrap(async (req, res) => {
    const body = customerFields.and(z.object({ password: z.string().min(8).max(128), internalNote: z.string().max(2000).optional(), blacklisted: z.boolean().optional() })).parse(req.body);
    const phone = phoneSchema.parse(normalizePhone(body.phone));
    uniqueCustomerPhone(phone);
    const passwordHash = await hashPassword(body.password);
    uniqueCustomerPhone(phone);
    const customer: User = { id: randomUUID(), name: body.name, username: body.name, phone, passwordHash, role: "customer", internalNote: body.internalNote, blacklisted: body.blacklisted || false, hairHistory: [] };
    repo.users.put(customer);
    res.status(201).json(adminCustomer(customer));
  }));

  app.patch("/api/admin/customers/:id", wrap((req, res) => {
    const existing = repo.users.get(req.params.id);
    ensure(existing?.role === "customer", 404, "Không tìm thấy khách hàng.");
    const body = customerFields.and(z.object({
      internalNote: z.string().max(2000).optional(),
      blacklisted: z.boolean().optional(),
      hairHistory: z.array(z.object({
        id: z.string(), date: z.string().refine(validDate), style: z.string().max(100),
        color: z.string().max(100).optional(), formula: z.string().max(500).optional(), note: z.string().max(500).optional()
      })).max(100).optional()
    })).parse({ name: existing.name, phone: existing.phone || "0000000000", internalNote: existing.internalNote, blacklisted: existing.blacklisted, hairHistory: existing.hairHistory, ...req.body });
    const phone = body.phone === "0000000000" && !existing.phone ? undefined : phoneSchema.parse(normalizePhone(body.phone));
    ensure(phone || existing.phone, 400, "Nhập số điện thoại để đăng nhập bằng tài khoản này.");
    uniqueCustomerPhone(phone, existing.id);
    const updated: User = { ...existing, name: body.name, username: existing.username || body.name, phone: phone || existing.phone, internalNote: body.internalNote, blacklisted: body.blacklisted, hairHistory: body.hairHistory };
    repo.users.put(updated);
    res.json(adminCustomer(updated));
  }));

  app.delete("/api/admin/customers/:id", wrap((req, res) => {
    const existing = repo.users.get(req.params.id);
    ensure(existing?.role === "customer", 404, "Không tìm thấy khách hàng.");
    ensure(!repo.appointments.all().some((item) => item.customerId === existing.id), 409, "Khách đã có lịch hẹn, không thể xóa lịch sử. Hãy giữ tài khoản này.");
    ensure(!existing.hairHistory?.length, 409, "Khách đã có lịch sử tóc. Hãy giữ hồ sơ này.");
    for (const notice of repo.notifications.all().filter((item) => item.customerId === existing.id)) repo.notifications.remove(notice.id);
    for (const device of repo.pushDevices.all().filter((item) => item.customerId === existing.id)) repo.pushDevices.remove(device.id);
    repo.users.remove(existing.id);
    res.status(204).end();
  }));

  const adminBookingSchema = z.object({
    barberId: z.string().min(1),
    serviceId: z.string().min(1),
    serviceIds: z.array(z.string().min(1)).min(1).max(5).optional(),
    startAt: z.string().min(1),
    voucherCode: z.string().trim().max(30).optional()
  });

  app.post("/api/admin/appointments", wrap(async (req, res) => {
    const body = adminBookingSchema.extend({
      customerId: z.string().optional(),
      walkInName: z.string().trim().min(2).max(100).optional(),
      walkInPhone: phoneSchema.optional()
    }).parse(req.body);
    const customer = body.customerId ? repo.users.get(body.customerId) : undefined;
    ensure(customer?.role === "customer" || !!body.walkInName, 400, "Chọn hồ sơ khách hàng hoặc nhập tên khách đến trực tiếp.");
    const walkIn = !customer;
    const booker: User = customer || { id: `walkin-${randomUUID()}`, name: body.walkInName!, phone: body.walkInPhone, passwordHash: "", role: "customer" };
    res.status(201).json(await booking.create(booker, { ...body, walkIn }));
  }));

  app.patch("/api/admin/appointments/:id", wrap(async (req, res) => {
    const body = adminBookingSchema.parse(req.body);
    res.json(await booking.reschedule(req.params.id, body));
  }));

  app.patch(
    "/api/admin/appointments/:id/status",
    wrap((req, res) => {
      const body = z.object({
        status: z.enum([
          "pending",
          "confirmed",
          "in_progress",
          "completed",
          "cancelled",
          "no_show"
        ]),
        cancelReason: z.string().trim().min(3).max(500).optional(),
        payment: z.object({ method: z.enum(["cash", "transfer", "card"]), amount: z.number().min(0) }).optional()
      }).parse(req.body);

      const updated = booking.changeStatus(
          req.params.id,
          body.status,
          body.cancelReason,
          body.payment,
          body.payment ? res.locals.user.id : undefined
        );
      const kinds = body.status === "completed" ? ["review_invite", ...(body.payment ? ["loyalty"] : [])] : ["booking"];
      const notices = repo.notifications.all().filter((item) => item.appointmentId === updated.id && kinds.includes(item.kind));
      if (notices.length) void sendPush(repo, notices);
      res.json(updated);
    })
  );

  app.post("/api/admin/appointments/:id/confirm-payment", wrap((req, res) => {
    const body = z.object({ payment: z.object({ method: z.enum(["cash", "transfer", "card"]), amount: z.number().min(0) }) }).parse(req.body);
    const updated = booking.confirmPayment(req.params.id, body.payment, res.locals.user.id);
    const notices = repo.notifications.all().filter((item) => item.appointmentId === updated.id && item.kind === "loyalty");
    if (notices.length) void sendPush(repo, notices);
    res.json(updated);
  }));

  app.get("/api/admin/statistics", wrap((req, res) => {
    const query = z.object({
      from: z.string().refine(validDate).optional(),
      to: z.string().refine(validDate).optional()
    }).parse(req.query);
    const today = DateTime.now().setZone(SHOP_ZONE).toISODate()!;
    const from = query.from || today;
    const to = query.to || today;
    ensure(from <= to, 400, "Khoảng ngày không hợp lệ.");
    const all = repo.appointments.all();
    const shopDay = (item: typeof all[number]) => DateTime.fromISO(item.startAt).setZone(SHOP_ZONE).toISODate()!;
    const appointments = all.filter((item) => shopDay(item) >= from && shopDay(item) <= to);

    res.json({
      total: appointments.length,
      pending: appointments.filter(
        (item) => item.status === "pending"
      ).length,
      confirmed: appointments.filter(
        (item) => item.status === "confirmed"
      ).length,
      inProgress: appointments.filter((item) => item.status === "in_progress").length,
      completed: appointments.filter(
        (item) => item.status === "completed"
      ).length,
      cancelled: appointments.filter((item) => item.status === "cancelled").length,
      noShow: appointments.filter((item) => item.status === "no_show").length,
      completedValue: appointments
        .filter(isAppointmentPaymentConfirmed)
        .reduce(
          (sum, item) => sum + (item.amountPaid || 0),
          0
        ),
      paidRevenue: appointments.filter(isAppointmentPaymentConfirmed).reduce((sum, item) => sum + (item.amountPaid || 0), 0),
      expectedRevenue: appointments.filter((item) => ["pending", "confirmed", "in_progress"].includes(item.status)).reduce((sum, item) => sum + item.priceSnapshot, 0),
      from,
      to,
      timeZone: SHOP_ZONE,
      todayAppointments: all.filter((item) => shopDay(item) === today).sort((a, b) => a.startAt.localeCompare(b.startAt)),
      needsAction: all.filter((item) => item.status === "pending" && shopDay(item) >= today).sort((a, b) => a.startAt.localeCompare(b.startAt))
    });
  }));

  app.get("/api/admin/services", (_req, res) => {
    const now = DateTime.now().toMillis();
    res.json(repo.services.all().map((service) => ({ ...service,
      futureAppointmentCount: repo.appointments.all().filter((item) => (item.serviceIds || [item.serviceId]).includes(service.id) && ["pending", "confirmed"].includes(item.status) && DateTime.fromISO(item.startAt).toMillis() > now).length
    })));
  });

  app.post(
    "/api/admin/services",
    wrap((req, res) => {
      const body = serviceSchema.parse(req.body);
      ensure(body.promotionPrice == null || body.promotionPrice <= body.price, 400, "Giá khuyến mãi không được cao hơn giá gốc.");
      const service = { id: randomUUID(), ...body };
      repo.services.put(service);
      res.status(201).json(service);
    })
  );

  app.patch(
    "/api/admin/services/:id",
    wrap((req, res) => {
      const existing = repo.services.get(req.params.id);
      ensure(existing, 404, "Không tìm thấy dịch vụ.");

      const changes = serviceSchema.partial().parse(req.body);
      const updated = { ...existing, ...changes };
      ensure(updated.promotionPrice == null || updated.promotionPrice <= updated.price, 400, "Giá khuyến mãi không được cao hơn giá gốc.");
      repo.services.put(updated);
      res.json(updated);
    })
  );

  app.delete(
    "/api/admin/services/:id",
    wrap((req, res) => {
      const existing = repo.services.get(req.params.id);
      ensure(existing, 404, "Không tìm thấy dịch vụ.");

      if (req.query.permanent === "true") {
        ensure(!repo.appointments.all().some((item) => (item.serviceIds || [item.serviceId]).includes(existing.id)), 409, "Dịch vụ đã có lịch hẹn. Hãy tạm ngừng để giữ lịch sử.");
        for (const barber of repo.barbers.all()) {
          if (barber.serviceIds?.includes(existing.id)) repo.barbers.put({ ...barber, serviceIds: barber.serviceIds.filter((id) => id !== existing.id) });
        }
        repo.services.remove(existing.id);
        res.status(204).end();
        return;
      }

      repo.services.put({ ...existing, active: false });
      res.status(204).end();
    })
  );

  app.get("/api/admin/barbers", (_req, res) => {
    const now = DateTime.now().toMillis();
    res.json(repo.barbers.all().map((barber) => ({ ...barber,
      accountPhone: repo.users.all().find((user) => user.role === "barber" && user.barberId === barber.id)?.phone || null,
      futureAppointmentCount: repo.appointments.all().filter((item) => item.barberId === barber.id && ["pending", "confirmed"].includes(item.status) && DateTime.fromISO(item.startAt).toMillis() > now).length
    })));
  });

  app.post(
    "/api/admin/barbers",
    wrap((req, res) => {
      const body = barberSchema.parse(req.body);
      ensure(!body.serviceIds || body.serviceIds.every((id) => !!repo.services.get(id)), 400, "Có dịch vụ không tồn tại.");
      const barber = { id: randomUUID(), ...body };
      repo.barbers.put(barber);
      res.status(201).json(barber);
    })
  );

  app.patch(
    "/api/admin/barbers/:id",
    wrap((req, res) => {
      const existing = repo.barbers.get(req.params.id);
      ensure(existing, 404, "Không tìm thấy thợ.");

      const changes = barberSchema.partial().parse(req.body);
      const updated = { ...existing, ...changes };
      ensure(!updated.serviceIds || updated.serviceIds.every((id) => !!repo.services.get(id)), 400, "Có dịch vụ không tồn tại.");
      ensure(!updated.serviceIds || repo.appointments.all().filter((item) => item.barberId === existing.id && ["pending", "confirmed", "in_progress"].includes(item.status)).every((item) => (item.serviceIds || [item.serviceId]).every((id) => updated.serviceIds!.includes(id))), 409, "Thợ còn lịch hẹn với dịch vụ này. Hãy đổi lịch trước khi bỏ kỹ năng.");
      repo.barbers.put(updated);
      const account = repo.users.all().find((user) => user.role === "barber" && user.barberId === existing.id);
      if (account) repo.users.put({ ...account, name: updated.name, phone: updated.phone });
      res.json(updated);
    })
  );

  app.delete(
    "/api/admin/barbers/:id",
    wrap((req, res) => {
      const existing = repo.barbers.get(req.params.id);
      ensure(existing, 404, "Không tìm thấy thợ.");

      if (req.query.permanent === "true") {
        ensure(!repo.appointments.all().some((item) => item.barberId === existing.id), 409, "Thợ đã có lịch hẹn. Hãy tạm ngừng để giữ lịch sử.");
        for (const schedule of repo.schedules.all().filter((item) => item.barberId === existing.id)) repo.schedules.remove(schedule.id);
        for (const block of repo.blocks.all().filter((item) => item.barberId === existing.id)) repo.blocks.remove(block.id);
        for (const leave of repo.leaves.all().filter((item) => item.barberId === existing.id)) repo.leaves.remove(leave.id);
        for (const rule of repo.weeklyShifts.all().filter((item) => item.barberId === existing.id)) repo.weeklyShifts.remove(rule.id);
        const account = repo.users.all().find((user) => user.role === "barber" && user.barberId === existing.id);
        const identity = barberParticipantId(existing.id);
        for (const thread of repo.supportMessages.all()) {
          if (thread.contactId === existing.id && thread.contactRole === "barber" ||
              thread.participantIds?.includes(identity) || account && thread.participantIds?.includes(account.id) ||
              supportEntries(thread).some((entry) => account && entry.senderId === account.id)) {
            repo.supportMessages.remove(thread.id);
          }
        }
        if (account) {
          repo.users.remove(account.id);
          for (const notice of repo.notifications.all().filter((item) => item.customerId === account.id)) repo.notifications.remove(notice.id);
          for (const device of repo.pushDevices.all().filter((item) => item.customerId === account.id)) repo.pushDevices.remove(device.id);
        }
        repo.barbers.remove(existing.id);
        res.status(204).end();
        return;
      }

      repo.barbers.put({ ...existing, active: false });
      res.status(204).end();
    })
  );

  app.get("/api/admin/work-schedules", (req, res) => {
    const query = z.object({
      barberId: z.string().optional(),
      from: z.string().refine(validDate).optional(),
      to: z.string().refine(validDate).optional()
    }).parse(req.query);
    const schedules = repo.schedules.all().filter((schedule) =>
      (!query.barberId || schedule.barberId === query.barberId) &&
      (!query.from || schedule.date >= query.from) &&
      (!query.to || schedule.date <= query.to)
    ).sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`));
    res.json(schedules.map((schedule) => {
      const bounds = scheduleBounds(schedule);
      return { ...schedule, activeAppointmentCount: repo.appointments.all().filter((item) =>
        item.barberId === schedule.barberId && ["pending", "confirmed"].includes(item.status) &&
        DateTime.fromISO(item.startAt).toMillis() >= bounds.start.toMillis() &&
        DateTime.fromISO(item.endAt).toMillis() <= bounds.end.toMillis()
      ).length };
    }));
  });

  function ensureAppointmentsCovered(schedules: ReturnType<Repository["schedules"]["all"]>) {
    for (const appointment of repo.appointments.all()) {
      if (appointment.status !== "pending" && appointment.status !== "confirmed" && appointment.status !== "in_progress") continue;
      const start = DateTime.fromISO(appointment.startAt).toMillis();
      const end = DateTime.fromISO(appointment.endAt).toMillis();
      const covered = schedules.some((schedule) => {
        if (schedule.barberId !== appointment.barberId) return false;
        const bounds = scheduleBounds(schedule);
        return start >= bounds.start.toMillis() && end <= bounds.end.toMillis();
      });
      ensure(covered, 409, "Thay đổi ca sẽ khiến lịch hẹn đang hiệu lực mất ca làm phù hợp.");
    }
  }

  function saveSchedule(
    id: string,
    body: z.infer<typeof scheduleSchema>
  ) {
    ensure(
      repo.barbers.get(body.barberId),
      404,
      "Không tìm thấy thợ."
    );

    const schedule = { id, ...body };
    const bounds = scheduleBounds(schedule);

    ensure(
      bounds.start.isValid &&
        bounds.end.isValid &&
        bounds.start < bounds.end,
      400,
      "Giờ kết thúc phải sau giờ bắt đầu."
    );

    const duplicate = repo.schedules.all().some((other) => {
      if (
        other.id === id ||
        other.barberId !== schedule.barberId ||
        other.date !== schedule.date
      ) {
        return false;
      }

      const otherBounds = scheduleBounds(other);

      return overlaps(
        bounds.start.toMillis(),
        bounds.end.toMillis(),
        otherBounds.start.toMillis(),
        otherBounds.end.toMillis()
      );
    });

    ensure(
      !duplicate,
      409,
      "Lịch làm việc bị chồng lấn."
    );

    ensureAppointmentsCovered([
      ...repo.schedules.all().filter((other) => other.id !== id),
      schedule
    ]);

    repo.schedules.put(schedule);
    return schedule;
  }

  app.post(
    "/api/admin/work-schedules",
    wrap((req, res) => {
      const body = scheduleSchema.parse(req.body);
      const today = DateTime.now().setZone(SHOP_ZONE).toISODate()!;
      ensure(body.date >= today, 400, "Không thể thêm ca vì ngày đã qua.");

      res.status(201).json(
        saveSchedule(randomUUID(), body)
      );
    })
  );

  app.patch(
    "/api/admin/work-schedules/:id",
    wrap((req, res) => {
      const existing = repo.schedules.get(req.params.id);
      ensure(existing, 404, "Không tìm thấy lịch làm việc.");

      const body = scheduleSchema.parse({
        ...existing,
        ...scheduleSchema.partial().parse(req.body)
      });

      res.json(saveSchedule(existing.id, body));
    })
  );

  app.delete(
    "/api/admin/work-schedules/:id",
    wrap((req, res) => {
      ensure(repo.schedules.get(req.params.id), 404, "Không tìm thấy lịch làm việc.");
      ensureAppointmentsCovered(repo.schedules.all().filter((schedule) => schedule.id !== req.params.id));
      repo.schedules.remove(req.params.id);
      res.status(204).end();
    })
  );

  registerAdminOperations(app, repo);

  app.use((_req, res) => {
    res.status(404).json({
      message: "API không tồn tại."
    });
  });

  app.use(
    (
      error: unknown,
      _req: Request,
      res: Response,
      _next: NextFunction
    ) => {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          message: error.issues
            .map((issue) => issue.message)
            .join("; ")
        });
        return;
      }

      if (error instanceof multer.MulterError) {
        res.status(
          error.code === "LIMIT_FILE_SIZE" ? 413 : 400
        ).json({
          message:
            error.code === "LIMIT_FILE_SIZE"
              ? "Ảnh vượt quá 5 MB."
              : "Dữ liệu upload không hợp lệ."
        });
        return;
      }

      if (error instanceof AppError) {
        res.status(error.status).json({
          message: error.message
        });
        return;
      }

      if (
        error instanceof SyntaxError &&
        "status" in error &&
        error.status === 400
      ) {
        res.status(400).json({
          message: "JSON không hợp lệ."
        });
        return;
      }

      // Không log request, token, ảnh, base64 hoặc API key.
      res.status(500).json({
        message: "Lỗi máy chủ."
      });
    }
  );

  return app;
}

