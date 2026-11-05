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
  active: z.boolean()
});

const barberSchema = z.object({
  name: z.string().trim().min(1).max(100),
  bio: z.string().max(1000),
  imageUrl: z.union([z.literal(""), z.string().url()]),
  active: z.boolean()
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
  app.use(helmet());

  const origins = config.CORS_ORIGINS
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin: origins.length ? origins : true
    })
  );

  app.use(express.json({ limit: "100kb" }));

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
        name: z.string().trim().min(2).max(100)
      }).parse(req.body);

      const user: User = {
        ...res.locals.user,
        name: body.name
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
      repo.barbers.all().filter((barber) => barber.active)
    );
  });

  app.get(
    "/api/availability",
    wrap((req, res) => {
      const query = z.object({
        barberId: z.string().min(1),
        serviceId: z.string().min(1),
        date: z.string()
      }).parse(req.query);

      res.json(
        booking.availability(
          query.barberId,
          query.serviceId,
          query.date
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
        startAt: z.string().min(1)
      }).parse(req.body);

      res.status(201).json(
        await booking.create(res.locals.user, body)
      );
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
      res.json(
        booking.cancel(res.locals.user, req.params.id)
      );
    })
  );

  const aiLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 8,
    keyGenerator: (_req, res) => res.locals.user.id,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
      message: "Đã vượt giới hạn tư vấn. Thử lại sau."
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
    aiLimiter,
    upload.single("image"),
    wrap(async (req, res) => {
      ensure(
        req.body.consent === "true",
        400,
        "Cần đồng ý gửi ảnh để sử dụng chức năng."
      );

      ensure(req.file, 400, "Chưa có ảnh.");

      let preferences: unknown;

      try {
        preferences = JSON.parse(req.body.preferences);
      } catch {
        throw new AppError(
          400,
          "Thông tin sở thích không hợp lệ."
        );
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
        status: z.enum([
          "pending",
          "confirmed",
          "completed",
          "cancelled"
        ]).optional()
      }).parse(req.query);

      const appointments = repo.appointments.all()
        .filter((appointment) => {
          const date = DateTime
            .fromISO(appointment.startAt)
            .setZone(SHOP_ZONE)
            .toISODate();

          return (
            (!query.date || date === query.date) &&
            (!query.status ||
              appointment.status === query.status)
          );
        })
        .sort((a, b) => a.startAt.localeCompare(b.startAt));

      res.json(appointments);
    })
  );

  app.patch(
    "/api/admin/appointments/:id/status",
    wrap((req, res) => {
      const body = z.object({
        status: z.enum([
          "pending",
          "confirmed",
          "completed",
          "cancelled"
        ])
      }).parse(req.body);

      res.json(
        booking.changeStatus(
          req.params.id,
          body.status
        )
      );
    })
  );

  app.get("/api/admin/statistics", (_req, res) => {
    const appointments = repo.appointments.all();

    res.json({
      total: appointments.length,
      pending: appointments.filter(
        (item) => item.status === "pending"
      ).length,
      confirmed: appointments.filter(
        (item) => item.status === "confirmed"
      ).length,
      completed: appointments.filter(
        (item) => item.status === "completed"
      ).length,
      revenue: appointments
        .filter((item) => item.status === "completed")
        .reduce(
          (sum, item) => sum + item.priceSnapshot,
          0
        )
    });
  });

  app.get("/api/admin/services", (_req, res) => {
    res.json(repo.services.all());
  });

  app.post(
    "/api/admin/services",
    wrap((req, res) => {
      const body = serviceSchema.parse(req.body);
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
      repo.services.put(updated);
      res.json(updated);
    })
  );

  app.delete(
    "/api/admin/services/:id",
    wrap((req, res) => {
      const existing = repo.services.get(req.params.id);
      ensure(existing, 404, "Không tìm thấy dịch vụ.");

      repo.services.put({ ...existing, active: false });
      res.status(204).end();
    })
  );

  app.get("/api/admin/barbers", (_req, res) => {
    res.json(repo.barbers.all());
  });

  app.post(
    "/api/admin/barbers",
    wrap((req, res) => {
      const body = barberSchema.parse(req.body);
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
      repo.barbers.put(updated);
      res.json(updated);
    })
  );

  app.delete(
    "/api/admin/barbers/:id",
    wrap((req, res) => {
      const existing = repo.barbers.get(req.params.id);
      ensure(existing, 404, "Không tìm thấy thợ.");

      repo.barbers.put({ ...existing, active: false });
      res.status(204).end();
    })
  );

  app.get("/api/admin/work-schedules", (_req, res) => {
    res.json(repo.schedules.all());
  });

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

    repo.schedules.put(schedule);
    return schedule;
  }

  function ensureScheduleNotBooked(id: string) {
    const schedule = repo.schedules.get(id);
    ensure(schedule, 404, "Không tìm thấy lịch làm việc.");

    const bounds = scheduleBounds(schedule);

    const hasBooking = repo.appointments.all().some(
      (appointment) =>
        appointment.barberId === schedule.barberId &&
        ["pending", "confirmed"].includes(appointment.status) &&
        overlaps(
          bounds.start.toMillis(),
          bounds.end.toMillis(),
          DateTime.fromISO(appointment.startAt).toMillis(),
          DateTime.fromISO(appointment.endAt).toMillis()
        )
    );

    ensure(
      !hasBooking,
      409,
      "Lịch làm việc đang có lịch hẹn. Xử lý lịch hẹn trước."
    );
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

      ensureScheduleNotBooked(existing.id);

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
      ensureScheduleNotBooked(req.params.id);
      repo.schedules.remove(req.params.id);
      res.status(204).end();
    })
  );

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

