export interface User {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  role: "customer" | "admin";
}

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

export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "completed"
  | "cancelled";

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

export interface WorkSchedule {
  id: string;
  barberId: string;
  date: string;
  startTime: string;
  endTime: string;
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
    reason: string;
    length: string;
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
  completed: number;
  revenue: number;
}

