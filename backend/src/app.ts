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
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { DateTime } from "luxon";

import { config, SHOP_ZONE } from "./config.js";
import { AppError, ensure } from "./errors.js";
import {
  createToken,
  hashPassword,
  publicUser,
  verifyPassword
} from "./security.js";
import {
  BookingService,
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

import type { User } from "./models.js";
import type { Repository } from "./repository.js";

type Handler = (
  req: Request,
  res: Response
) => unknown | Promise<unknown>;

const wrap =
  (handler: Handler) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve()
      .then(() => handler(req, res))
      .catch(next);
  };
  
const phoneSchema = z.string().regex(
  /^\d{9,15}$/,
  "Số điện thoại cần từ 9 đến 15 chữ số."
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

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      storage: "in-memory",
      aiMode: config.AI_MODE
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
        name: z.string().trim().min(2).max(100),
        phone: z.string().regex(/^\d{9,15}$/, "Số điện thoại cần từ 9 đến 15 chữ số.").optional().or(z.literal("")),
        email: z.string().email("Email không đúng định dạng.").optional().or(z.literal("")),
        password: z.string().min(8).max(128)
      }).refine((data) => (data.phone && data.phone.length > 0) || (data.email && data.email.length > 0), {
        message: "Cần cung cấp ít nhất số điện thoại hoặc email."
      }).parse(req.body);

      const phone = body.phone?.trim() || undefined;
      const email = body.email?.trim().toLowerCase() || undefined;

      if (phone) {
        ensure(!repo.users.byPhone(phone), 409, "Số điện thoại đã được đăng ký.");
      }
      if (email) {
        ensure(!repo.users.byEmail(email), 409, "Email đã được đăng ký.");
      }

      const passwordHash = await hashPassword(body.password);

      // Kiểm tra lại sau await để tránh hai đăng ký đồng thời.
      if (phone) {
        ensure(!repo.users.byPhone(phone), 409, "Số điện thoại đã được đăng ký.");
      }
      if (email) {
        ensure(!repo.users.byEmail(email), 409, "Email đã được đăng ký.");
      }

      const user: User = {
        id: randomUUID(),
        name: body.name,
        phone,
        email,
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
        phone: z.string().optional(),
        email: z.string().optional(),
        identifier: z.string().optional(),
        password: z.string().min(1).max(128)
      }).parse(req.body);

      const searchKey = (body.identifier || body.phone || body.email || "").trim();
      ensure(searchKey, 400, "Vui lòng nhập số điện thoại hoặc email.");

      const user = repo.users.byPhoneOrEmail(searchKey);

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

  app.post(
    "/api/auth/forgot-password",
    authLimiter,
    wrap((req, res) => {
      const body = z.object({
        identifier: z.string().trim().min(1, "Vui lòng nhập số điện thoại hoặc email.")
      }).parse(req.body);

      const user = repo.users.byPhoneOrEmail(body.identifier);
      res.json({
        ok: true,
        message: user
          ? `Mã xác thực khôi phục mật khẩu demo đã được gửi tới ${body.identifier}.`
          : `Nếu thông tin khớp trong hệ thống, mã xác thực demo sẽ được gửi tới ${body.identifier}.`
      });
    })
  );

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
        paymentChoice: z.literal("salon").optional(),
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
      );
    }
  );

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

      res.json(appointment);
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
      res.json(updated);
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
    res.json(pending);
  }));

  app.post("/api/appointments/:id/review", customerOnly, wrap((req, res) => {
    const appointment = repo.appointments.get(req.params.id);
    ensure(appointment && appointment.customerId === res.locals.user.id, 404, "Không tìm thấy lịch hẹn.");
    ensure(appointment.status === "completed", 409, "Chỉ đánh giá lịch đã hoàn thành.");
    ensure(!appointment.rating, 409, "Lịch này đã được đánh giá.");
    const body = z.object({ rating: z.number().int().min(1).max(5), review: z.string().trim().max(500).optional(),
      photo: z.string().regex(/^data:image\/(jpeg|png);base64,/).max(350000).optional(), portfolioConsent: z.boolean().optional() }).parse(req.body);
    const updated = { ...appointment, rating: body.rating, review: body.review, reviewPhoto: body.photo, portfolioConsent: body.portfolioConsent === true };
    repo.appointments.put(updated); res.json(updated);
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

  app.get("/api/support/messages/me", customerOnly, (_req, res) => {
    res.json(repo.supportMessages.all().filter((item) => item.customerId === res.locals.user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  });
  app.post("/api/support/messages", customerOnly, wrap((req, res) => {
    const { body } = z.object({ body: z.string().trim().min(2).max(500) }).parse(req.body);
    const message = { id: randomUUID(), customerId: res.locals.user.id, body, createdAt: new Date().toISOString() };
    repo.supportMessages.put(message); res.status(201).json(message);
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

  const adminCustomer = (user: User) => { const { passwordHash, ...safe } = user; return safe; };
  app.get("/api/admin/customers", (_req, res) => {
    res.json(repo.users.all().filter((user) => user.role === "customer").map(adminCustomer));
  });

  const customerFields = z.object({
    name: z.string().trim().min(2).max(100),
    phone: phoneSchema.optional().or(z.literal("")),
    email: z.string().email().optional().or(z.literal(""))
  }).refine((value) => !!(value.phone || value.email), "Cần số điện thoại hoặc email.");

  function uniqueCustomerContacts(phone: string | undefined, email: string | undefined, exceptId?: string) {
    if (phone) ensure(!repo.users.all().some((user) => user.id !== exceptId && user.phone === phone), 409, "Số điện thoại đã được sử dụng.");
    if (email) ensure(!repo.users.all().some((user) => user.id !== exceptId && user.email?.toLowerCase() === email), 409, "Email đã được sử dụng.");
  }

  app.post("/api/admin/customers", wrap(async (req, res) => {
    const body = customerFields.and(z.object({ password: z.string().min(8).max(128), tier: z.enum(["silver", "gold", "vip"]).optional(), internalNote: z.string().max(2000).optional(), blacklisted: z.boolean().optional() })).parse(req.body);
    const phone = body.phone || undefined;
    const email = body.email?.trim().toLowerCase() || undefined;
    uniqueCustomerContacts(phone, email);
    const passwordHash = await hashPassword(body.password);
    uniqueCustomerContacts(phone, email);
    const customer: User = { id: randomUUID(), name: body.name, phone, email, passwordHash, role: "customer", tier: body.tier || "silver", internalNote: body.internalNote, blacklisted: body.blacklisted || false, hairHistory: [] };
    repo.users.put(customer);
    res.status(201).json(adminCustomer(customer));
  }));

  app.patch("/api/admin/customers/:id", wrap((req, res) => {
    const existing = repo.users.get(req.params.id);
    ensure(existing?.role === "customer", 404, "Không tìm thấy khách hàng.");
    const body = customerFields.and(z.object({
      tier: z.enum(["silver", "gold", "vip"]).optional(),
      internalNote: z.string().max(2000).optional(),
      blacklisted: z.boolean().optional(),
      hairHistory: z.array(z.object({
        id: z.string(), date: z.string().refine(validDate), style: z.string().max(100),
        color: z.string().max(100).optional(), formula: z.string().max(500).optional(), note: z.string().max(500).optional()
      })).max(100).optional()
    })).parse({ name: existing.name, phone: existing.phone || "", email: existing.email || "", tier: existing.tier, internalNote: existing.internalNote, blacklisted: existing.blacklisted, hairHistory: existing.hairHistory, ...req.body });
    const phone = body.phone || undefined;
    const email = body.email?.trim().toLowerCase() || undefined;
    uniqueCustomerContacts(phone, email, existing.id);
    const updated: User = { ...existing, name: body.name, phone, email, tier: body.tier, internalNote: body.internalNote, blacklisted: body.blacklisted, hairHistory: body.hairHistory };
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
    ensure(customer?.role === "customer" || !!body.walkInName, 400, "Chọn khách hàng hoặc nhập tên khách vãng lai.");
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
          body.payment
        );
      const kinds = body.status === "completed" ? ["review_invite", "loyalty"] : ["booking"];
      const notices = repo.notifications.all().filter((item) => item.appointmentId === updated.id && kinds.includes(item.kind));
      if (notices.length) void sendPush(repo, notices);
      res.json(updated);
    })
  );

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
        .filter((item) => item.status === "completed")
        .reduce(
          (sum, item) => sum + item.priceSnapshot,
          0
        ),
      paidRevenue: appointments.filter((item) => item.status === "completed").reduce((sum, item) => sum + (item.amountPaid || 0), 0),
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

