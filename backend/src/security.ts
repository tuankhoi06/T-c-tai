import {
  randomBytes,
  scrypt,
  timingSafeEqual
} from "node:crypto";
import { promisify } from "node:util";
import type { PublicUser, User } from "./models.js";

const derive = promisify(scrypt);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = (await derive(password, salt, 64)) as Buffer;

  return `${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const [salt, encoded] = stored.split(":");

  if (!salt || !encoded) return false;

  const expected = Buffer.from(encoded, "hex");
  const actual = (await derive(password, salt, 64)) as Buffer;

  return (
    expected.length === actual.length &&
    timingSafeEqual(expected, actual)
  );
}

export function publicUser(user: User): PublicUser {
  return { id: user.id, name: user.name, username: user.username, phone: user.phone, role: user.role,
    birthday: user.birthday, loyaltyPoints: user.loyaltyPoints || 0,
    barberId: user.barberId, noShowCount: user.noShowCount || 0,
    hairHistory: user.hairHistory?.map(({ id, date, style, color, note }) => ({ id, date, style, color, note })) };
}

export function createToken(): string {
  return randomBytes(32).toString("hex");
}

export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("84") ? `0${digits.slice(2)}` : digits;
}

