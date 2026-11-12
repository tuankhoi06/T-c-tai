import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";
import { hashPassword } from "./security.js";
import { SupabaseRepository } from "./supabase-repository.js";
import type { User } from "./models.js";

if (!config.SUPABASE_URL || !config.SUPABASE_SECRET_KEY) {
  throw new Error("Cần cấu hình SUPABASE_URL và SUPABASE_SECRET_KEY trong backend/.env.");
}

const repo = new SupabaseRepository(createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
}));
await repo.initialize();

const credentials = [
  { barberId: "barber-1", phone: "0900000201" },
  { barberId: "barber-2", phone: "0900000202" },
  { barberId: "barber-3", phone: "0900000203" },
  { barberId: "barber-4", phone: "0900000204" },
  { barberId: "barber-5", phone: "0900000205" }
];
const passwordHash = await hashPassword("Barber123!");
let created = 0;
let alreadyLinked = 0;

for (const { barberId, phone } of credentials) {
  const barber = repo.barbers.get(barberId);
  if (!barber) throw new Error(`Không tìm thấy hồ sơ thợ ${barberId}; hãy nạp hồ sơ thợ trước.`);
  const existingAccount = repo.users.all().find((user) => user.role === "barber" && user.barberId === barberId);
  if (existingAccount) {
    const updated = { ...existingAccount, name: barber.name, username: barber.name, phone };
    delete updated.email;
    repo.users.put(updated);
    if (barber.phone !== phone) repo.barbers.put({ ...barber, phone });
    alreadyLinked += 1;
    continue;
  }
  const phoneOwner = repo.users.byPhone(phone);
  if (phoneOwner) throw new Error(`Số demo ${phone} đã thuộc tài khoản khác.`);
  const account: User = { id: `barber-account-${barberId}`, name: barber.name, username: barber.name, phone, passwordHash, role: "barber", barberId };
  if (repo.users.get(account.id)) account.id = randomUUID();
  repo.users.put(account);
  if (barber.phone !== phone) repo.barbers.put({ ...barber, phone });
  created += 1;
}

await repo.flush();
console.log(JSON.stringify({ storage: repo.storageType, created, alreadyLinked, demoPassword: "Barber123!", accounts: credentials.map(({ phone, barberId }) => ({ phone, barberId })) }, null, 2));
