import { DateTime } from "luxon";
import { createClient } from "@supabase/supabase-js";
import { config, SHOP_ZONE } from "./config.js";
import { SupabaseRepository } from "./supabase-repository.js";
import { hashPassword } from "./security.js";
import { demoCustomerAccounts, demoCustomerPassword } from "./demo-customer-accounts.js";
import type { Appointment, Barber, HairService, PaymentMethod, User } from "./models.js";

if (!config.SUPABASE_URL || !config.SUPABASE_SECRET_KEY) {
  throw new Error("Cần cấu hình SUPABASE_URL và SUPABASE_SECRET_KEY trong backend/.env.");
}

const repo = new SupabaseRepository(createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
}));

await repo.initialize();

const now = DateTime.now().setZone(SHOP_ZONE);
const today = now.startOf("day");
const barbers = repo.barbers.all().filter((barber) => barber.active).sort((a, b) => a.id.localeCompare(b.id));
const services = repo.services.all().filter((service) => service.active).sort((a, b) => a.id.localeCompare(b.id));
for (const contact of demoCustomerAccounts) {
  const current = repo.users.get(contact.id);
  if (current && current.role !== "customer") throw new Error(`Demo customer ID đã thuộc tài khoản khác: ${contact.id}`);
  const customer: User = current?.role === "customer"
    ? { ...current, name: contact.name, username: current.username || contact.name, phone: contact.phone }
    : { ...contact, passwordHash: await hashPassword(demoCustomerPassword), role: "customer", blacklisted: false, hairHistory: [] };
  repo.users.put(customer);
}
const customers = demoCustomerAccounts.map(({ id }) => repo.users.get(id)).filter((user): user is User => !!user && user.role === "customer");
const paymentMethods: PaymentMethod[] = ["cash", "transfer", "card"];
const serviceNames: Record<string, string> = {
  cut: "Cắt tóc",
  wash: "Gội và chăm sóc tóc",
  dye: "Nhuộm tóc",
  perm: "Uốn tóc"
};
const reviews = [
  "Tư vấn kỹ, khách hài lòng với kiểu tóc.",
  "Làm đúng yêu cầu, tóc dễ chăm sóc.",
  "Dịch vụ tốt, sẽ quay lại lần sau."
];

if (!barbers.length || !services.length) {
  throw new Error("Supabase chưa có dữ liệu thợ hoặc dịch vụ. Hãy nạp dữ liệu demo cơ bản trước.");
}

let schedulesAdded = 0;
let historicalAdded = 0;
let todayAdded = 0;
let upcomingAdded = 0;
let conflictsSkipped = 0;

for (let offset = -30; offset <= 30; offset += 1) {
  const day = today.plus({ days: offset });
  const date = day.toISODate()!;
  for (const barber of barbers) {
    const exists = repo.schedules.all().some((schedule) => schedule.barberId === barber.id && schedule.date === date);
    if (exists) continue;
    repo.schedules.put({
      id: `demo-month-shift-${barber.id}-${date}`,
      barberId: barber.id,
      date,
      startTime: "09:00",
      endTime: "19:00"
    });
    schedulesAdded += 1;
  }
}

function eligibleServices(barber: Barber) {
  const matches = services.filter((service) => !barber.serviceIds || barber.serviceIds.includes(service.id));
  return matches.length ? matches : services;
}

function buildAppointment(input: {
  id: string;
  date: string;
  time: string;
  barber: Barber;
  service: HairService;
  status: Appointment["status"];
  customer: User;
  walkIn?: boolean;
  paymentMethod?: PaymentMethod;
  rating?: number;
  createdAt: string;
}): Appointment {
  const [hour, minute] = input.time.split(":").map(Number);
  const start = DateTime.fromISO(input.date, { zone: SHOP_ZONE }).set({ hour, minute, second: 0, millisecond: 0 });
  const end = start.plus({ minutes: input.service.durationMinutes });
  const price = input.service.promotionPrice ?? input.service.price;
  const commissionRate = input.barber.commissionRate || 0;
  const serviceItem = {
    id: input.service.id,
    name: input.service.name,
    price,
    durationMinutes: input.service.durationMinutes
  };
  const appointment: Appointment = {
    id: input.id,
    customerId: input.customer.id,
    customerNameSnapshot: input.customer.name,
    ...(input.customer.phone ? { customerPhoneSnapshot: input.customer.phone } : {}),
    barberId: input.barber.id,
    barberNameSnapshot: input.barber.name,
    serviceId: input.service.id,
    serviceNameSnapshot: input.service.name,
    serviceIds: [input.service.id],
    serviceItems: [serviceItem],
    priceSnapshot: price,
    durationSnapshot: input.service.durationMinutes,
    startAt: start.toISO()!,
    endAt: end.toISO()!,
    status: input.status,
    ...(input.walkIn ? { walkIn: true } : {}),
    paymentChoice: "salon",
    commissionRateSnapshot: commissionRate,
    createdAt: input.createdAt
  };

  if (input.status === "completed") {
    appointment.paymentMethod = input.paymentMethod || "cash";
    appointment.amountPaid = price;
    appointment.paymentConfirmedAt = input.createdAt;
    appointment.commissionAmount = Math.round(price * commissionRate / 100);
    appointment.rating = input.rating || 5;
    appointment.review = reviews[input.rating ? input.rating % reviews.length : 0];
    appointment.styleName = serviceNames[input.service.id] || input.service.name;
  }

  return appointment;
}

function hasAppointmentConflict(candidate: Appointment) {
  const start = DateTime.fromISO(candidate.startAt).toMillis();
  const end = DateTime.fromISO(candidate.endAt).toMillis();
  return repo.appointments.all().some((item) => item.barberId === candidate.barberId &&
    DateTime.fromISO(item.startAt).toMillis() < end && DateTime.fromISO(item.endAt).toMillis() > start);
}

async function addAppointment(candidate: Appointment, category: "history" | "today" | "upcoming") {
  if (repo.appointments.get(candidate.id)) return;
  if (hasAppointmentConflict(candidate)) {
    conflictsSkipped += 1;
    return;
  }
  repo.appointments.put(candidate);
  if (category === "history") historicalAdded += 1;
  else if (category === "today") todayAdded += 1;
  else upcomingAdded += 1;
}

let oldPlaceholdersReplaced = 0;
let replacementIndex = 0;
for (const item of repo.appointments.all().filter((appointment) => appointment.customerNameSnapshot.toLocaleLowerCase("vi-VN").includes("vãng lai") || appointment.customerId.startsWith("demo-walkin-"))) {
  const customer = customers[replacementIndex % customers.length];
  replacementIndex += 1;
  repo.appointments.put({ ...item, customerId: customer.id, customerNameSnapshot: customer.name, customerPhoneSnapshot: customer.phone, walkIn: true });
  oldPlaceholdersReplaced += 1;
}

for (let offset = -30; offset < 0; offset += 1) {
  const day = today.plus({ days: offset });
  const date = day.toISODate()!;
  for (let slot = 0; slot < 2; slot += 1) {
    const barber = barbers[(Math.abs(offset) + slot * 2) % barbers.length];
    const options = eligibleServices(barber);
    const service = options[(Math.abs(offset) + slot * 3) % options.length];
    const customer = customers[(Math.abs(offset) * 2 + slot) % customers.length];
    const rating = 4 + ((Math.abs(offset) + slot) % 2);
    await addAppointment(buildAppointment({
      id: `demo-revenue-${date}-${barber.id}`,
      date,
      time: slot === 0 ? "09:30" : "15:00",
      barber,
      service,
      status: "completed",
      customer,
      walkIn: true,
      paymentMethod: paymentMethods[(Math.abs(offset) + slot) % paymentMethods.length],
      rating,
      createdAt: day.minus({ days: 2 }).set({ hour: 10 }).toISO()!
    }), "history");
  }
}

for (let slot = 0; slot < Math.min(2, barbers.length); slot += 1) {
  const barber = barbers[slot];
  const service = eligibleServices(barber).find((item) => item.id === "cut") || eligibleServices(barber)[0];
  const start = now.minus({ hours: slot === 0 ? 4 : 2 }).set({ minute: 0, second: 0, millisecond: 0 });
  const end = start.plus({ minutes: service.durationMinutes });
  const status: Appointment["status"] = end <= now ? "completed" : start <= now ? "in_progress" : "confirmed";
  await addAppointment(buildAppointment({
    id: `demo-today-${today.toISODate()}-${barber.id}`,
    date: today.toISODate()!,
    time: start.toFormat("HH:mm"),
    barber,
    service,
    status,
    customer: customers[slot % customers.length],
    walkIn: true,
    ...(status === "completed" ? { paymentMethod: paymentMethods[slot] } : {}),
    createdAt: start.minus({ hours: 1 }).toISO()!
  }), "today");
}

for (let offset = 3, index = 0; offset <= 30; offset += 3, index += 1) {
  const day = today.plus({ days: offset });
  const date = day.toISODate()!;
  const barber = barbers[index % barbers.length];
  const options = eligibleServices(barber).filter((service) => ["cut", "wash"].includes(service.id));
  const service = options.length ? options[index % options.length] : eligibleServices(barber)[0];
  const candidate = buildAppointment({
    id: `demo-upcoming-${date}-${barber.id}`,
    date,
    time: "16:00",
    barber,
    service,
    status: index % 4 === 0 ? "pending" : "confirmed",
    customer: customers[(index + 2) % customers.length],
    walkIn: true,
    createdAt: now.toISO()!
  });
  await addAppointment(candidate, "upcoming");
}

await repo.flush();

console.log(JSON.stringify({
  storage: repo.storageType,
  range: { from: today.minus({ days: 30 }).toISODate(), to: today.plus({ days: 30 }).toISODate() },
  activeBarbers: barbers.length,
  namedDemoCustomers: customers.length,
  oldWalkInPlaceholdersReplaced: oldPlaceholdersReplaced,
  schedulesAdded,
  historicalCompletedAppointmentsAdded: historicalAdded,
  todayAppointmentsAdded: todayAdded,
  upcomingAppointmentsAdded: upcomingAdded,
  conflictsSkipped,
  idempotent: true
}, null, 2));
