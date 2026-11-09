export interface User {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  role: "customer" | "admin";
  tier?: "silver" | "gold" | "vip";
  internalNote?: string;
  blacklisted?: boolean;
  hairHistory?: HairRecord[];
  birthday?: string;
  loyaltyPoints?: number;
}

export interface HairRecord { id: string; date: string; style: string; color?: string; formula?: string; note?: string }

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

export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show";

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
  startedAt?: string;
  rating?: number;
  review?: string;
  reviewPhoto?: string;
  portfolioConsent?: boolean;
  note?: string;
  styleName?: string;
  paymentChoice?: "salon" | "prepay";
  aiHaircutName?: string;
  aiBarberNote?: string;
  cancelReason?: string;
  createdAt: string;
}

export interface WorkSchedule {
  id: string;
  barberId: string;
  date: string;
  startTime: string;
  endTime: string;
  sourceWeeklyId?: string;
  activeAppointmentCount?: number;
}

export interface TimeBlock { id: string; barberId: string; date: string; startTime: string; endTime: string; reason: string }
export interface LeaveRequest { id: string; barberId: string; from: string; to: string; reason: string; status: "pending" | "approved" | "rejected" }
export interface WeeklyShift { id: string; barberId: string; weekday: number; startTime: string; endTime: string; from: string; to: string }
export interface Voucher { id: string; code: string; kind: "percent" | "fixed"; value: number; maxUses: number; usedCount: number; from: string; to: string; startTime?: string | null; endTime?: string | null; active: boolean; ownerId?: string }
export interface Notification { id: string; customerId: string; title: string; body: string; createdAt: string; read: boolean; kind: "promotion" | "reminder" | "manual" | "booking" | "review_invite" | "loyalty" | "care" | "birthday"; appointmentId?: string; stage?: "two_hours" | "thirty_minutes" }

export interface AdminDashboard {
  todayTotal: number; inService: number; expectedRevenue: number; paidRevenue: number; cancellationRate: number;
  upcoming: Appointment[];
  stylistStatus: { barberId: string; name: string; status: "available" | "busy" | "off"; appointment?: Appointment }[];
}

export interface AdminReport {
  from: string; to: string; completedRevenue: number; paidRevenue: number; expectedRevenue: number;
  byPayment: { method: string; total: number }[];
  byService: { serviceId: string; name: string; count: number; revenue: number }[];
  byBarber: { barberId: string; name: string; count: number; revenue: number; commission: number; ratingAverage: number | null }[];
  peakHours: { hour: number; count: number }[];
  retentionRate: number;
}

export interface Preferences {
  hairLength?: string;
  desiredLength?: string;
  hairTexture?: string;
  hairDensity?: string;
  preferredStyle?: string;
  maintenanceLevel?: "low" | "medium" | "high";
  wantsDye?: boolean;
  wantsPerm?: boolean;
  hairCondition?: string;
}

export interface ConsultationResult {
  mode: "mock" | "live";
  imageAssessment: {
    suitable: boolean;
    message: string;
  };
  faceShapeEstimate: string;
  observations: string[];
  haircutRecommendations: {
    name: string;
    direction?: string;
    reason: string;
    length: string;
    feasibility?: string;
    stylingMethod?: string;
    suggestedService?: string;
    maintenance: string;
    barberNote: string;
  }[];
  colorAdvice: {
    recommendation: string;
    suggestedColors: string[];
    reason: string;
  };
  permAdvice: {
    recommendation: string;
    reason: string;
  };
  limitations: string[];
  disclaimer: string;
}

export interface Statistics {
  total: number;
  pending: number;
  confirmed: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  noShow: number;
  completedValue: number;
  paidRevenue: number;
  expectedRevenue: number;
  from: string;
  to: string;
  timeZone: string;
  todayAppointments: Appointment[];
  needsAction: Appointment[];
}

