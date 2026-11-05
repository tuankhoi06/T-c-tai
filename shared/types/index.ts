
export type Role = "customer" | "admin";

export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "completed"
  | "cancelled";

export interface User {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  passwordHash?: string;
  role: Role;
}

export type PublicUser = Omit<User, "passwordHash">;

export interface HairService {
  id: string;
  name: string;
  description: string;
  price: number;
  durationMinutes: number;
  active: boolean;
}

export interface Barber {
  id: string;
  name: string;
  bio: string;
  imageUrl: string;
  active: boolean;
}

export interface WorkSchedule {
  id: string;
  barberId: string;
  date: string;
  startTime: string;
  endTime: string;
}

export interface Appointment {
  id: string;
  customerId: string;
  customerNameSnapshot: string;
  barberId: string;
  barberNameSnapshot: string;
  serviceId: string;
  serviceNameSnapshot: string;
  priceSnapshot: number;
  durationSnapshot: number;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
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
  revenue: number;
}

