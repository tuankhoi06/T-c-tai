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
  const { passwordHash, ...safe } = user;
  return safe;
}

export function createToken(): string {
  return randomBytes(32).toString("hex");
}

