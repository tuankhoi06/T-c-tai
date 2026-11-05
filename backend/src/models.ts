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
  passwordHash: string;
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

