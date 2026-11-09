export type Role = "customer" | "admin";

export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show";

export type PaymentMethod = "cash" | "transfer" | "card";

export interface HairRecord {
  id: string;
  date: string;
  style: string;
  color?: string;
  formula?: string;
  note?: string;
}

export interface User {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  passwordHash: string;
  role: Role;
  tier?: "silver" | "gold" | "vip";
  internalNote?: string;
  blacklisted?: boolean;
  hairHistory?: HairRecord[];
  birthday?: string;
  loyaltyPoints?: number;
}

export type PublicUser = Omit<User, "passwordHash">;

export interface HairService {
  id: string;
  name: string;
  description: string;
  price: number;
  durationMinutes: number;
  active: boolean;
  category?: "cut" | "wash" | "chemical" | "care" | "combo";
  imageUrl?: string;
  process?: string;
  promotionPrice?: number | null;
}

export interface Barber {
  id: string;
  name: string;
  bio: string;
  imageUrl: string;
  active: boolean;
  phone?: string;
  title?: "master" | "top" | "junior";
  serviceIds?: string[] | null;
  commissionRate?: number;
}

export interface WorkSchedule {
  id: string;
  barberId: string;
  date: string;
  startTime: string;
  endTime: string;
  sourceWeeklyId?: string;
}

export interface Appointment {
  id: string;
  customerId: string;
  customerNameSnapshot: string;
  customerPhoneSnapshot?: string;
  barberId: string;
  barberNameSnapshot: string;
  serviceId: string;
  serviceNameSnapshot: string;
  serviceIds?: string[];
  serviceItems?: { id: string; name: string; price: number; durationMinutes: number }[];
  priceSnapshot: number;
  durationSnapshot: number;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  walkIn?: boolean;
  voucherCode?: string;
  discountAmount?: number;
  paymentMethod?: PaymentMethod;
  amountPaid?: number;
  startedAt?: string;
  rating?: number;
  review?: string;
  note?: string;
  styleName?: string;
  paymentChoice?: "salon" | "prepay";
  reviewPhoto?: string;
  portfolioConsent?: boolean;
  aiHaircutName?: string;
  aiBarberNote?: string;
  cancelReason?: string;
  createdAt: string;
}

export interface Session {
  userId: string;
  expiresAt: number;
}

export interface TimeBlock {
  id: string;
  barberId: string;
  date: string;
  startTime: string;
  endTime: string;
  reason: string;
}

export interface LeaveRequest {
  id: string;
  barberId: string;
  from: string;
  to: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
}

export interface WeeklyShift {
  id: string;
  barberId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  from: string;
  to: string;
}

export interface Voucher {
  id: string;
  code: string;
  kind: "percent" | "fixed";
  value: number;
  maxUses: number;
  usedCount: number;
  from: string;
  to: string;
  startTime?: string | null;
  endTime?: string | null;
  active: boolean;
  ownerId?: string;
}

export interface Notification {
  id: string;
  customerId: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  kind: "promotion" | "reminder" | "manual" | "booking" | "review_invite" | "loyalty" | "care" | "birthday";
  appointmentId?: string;
  stage?: "two_hours" | "thirty_minutes";
}

export interface PushDevice {
  id: string;
  customerId: string;
  token: string;
}

export interface SupportMessage {
  id: string;
  customerId: string;
  body: string;
  createdAt: string;
  reply?: string;
  repliedAt?: string;
}

