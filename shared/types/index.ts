
export type Role = "customer" | "admin" | "barber";

export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show";

export interface User {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  passwordHash?: string;
  role: Role;
  internalNote?: string;
  blacklisted?: boolean;
  hairHistory?: { id: string; date: string; style: string; color?: string; formula?: string; note?: string }[];
  birthday?: string;
  loyaltyPoints?: number;
  barberId?: string;
  noShowCount?: number;
}

export type PublicUser = Omit<User, "passwordHash">;

export interface HairService {
  id: string;
  name: string;
  description: string;
  price: number;
  durationMinutes: number;
  active: boolean;
  futureAppointmentCount?: number;
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
  futureAppointmentCount?: number;
  phone?: string;
  title?: "master" | "top" | "junior";
  serviceIds?: string[] | null;
  commissionRate?: number;
  ratingAverage?: number | null;
  reviewCount?: number;
  portfolio?: { styleName: string; photo?: string; rating?: number }[];
}

export interface WorkSchedule {
  id: string;
  barberId: string;
  date: string;
  startTime: string;
  endTime: string;
  activeAppointmentCount?: number;
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
  paymentMethod?: "cash" | "transfer" | "card";
  amountPaid?: number;
  commissionRateSnapshot?: number;
  commissionAmount?: number;
  startedAt?: string;
  rating?: number;
  review?: string;
  reviewPhoto?: string;
  portfolioConsent?: boolean;
  note?: string;
  styleName?: string;
  paymentChoice?: "salon" | "prepay";
  depositRequired?: number;
  simulatedPaid?: number;
  simulatedPaymentReference?: string;
  aiHaircutName?: string;
  aiBarberNote?: string;
  cancelReason?: string;
  createdAt: string;
}

export interface Session {
  userId: string;
  expiresAt: number;
}

export interface Preferences {
  hairLength: string;
  desiredLength: string;
  hairTexture: string;
  hairDensity: string;
  preferredStyle: string;
  maintenanceLevel: "low" | "medium" | "high";
  wantsDye: boolean;
  wantsPerm: boolean;
  hairCondition: string;
}

export interface HaircutRecommendation {
  name: string;
  direction?: string;
  reason: string;
  length: string;
  feasibility?: string;
  stylingMethod?: string;
  suggestedService?: string;
  maintenance: string;
  barberNote: string;
}

export interface ColorAdvice {
  recommendation: string;
  suggestedColors: string[];
  reason: string;
}

export interface PermAdvice {
  recommendation: string;
  reason: string;
}

export interface ConsultationResult {
  mode: "mock" | "live";
  imageAssessment: {
    suitable: boolean;
    message: string;
  };
  faceShapeEstimate: string;
  observations: string[];
  haircutRecommendations: HaircutRecommendation[];
  colorAdvice: ColorAdvice;
  permAdvice: PermAdvice;
  limitations: string[];
  disclaimer: string;
}

export interface Statistics {
  total: number;
  pending: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  completedValue: number;
  from: string;
  to: string;
  timeZone: string;
  todayAppointments: Appointment[];
  needsAction: Appointment[];
}

