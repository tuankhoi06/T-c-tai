import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";
import { hashPassword } from "./security.js";
import { SupabaseRepository } from "./supabase-repository.js";
import { demoCustomerAccounts, demoCustomerPassword } from "./demo-customer-accounts.js";
import type { User } from "./models.js";

if (!config.SUPABASE_URL || !config.SUPABASE_SECRET_KEY) {
  throw new Error("Cần cấu hình SUPABASE_URL và SUPABASE_SECRET_KEY trong backend/.env.");
}

const repo = new SupabaseRepository(createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
}));

await repo.initialize();
let created = 0;
let existing = 0;

for (const account of demoCustomerAccounts) {
  const current = repo.users.get(account.id);
  if (current && current.role !== "customer") throw new Error(`ID demo đã thuộc tài khoản khác: ${account.id}`);
  const phoneOwner = repo.users.byPhone(account.phone);
  if (phoneOwner && phoneOwner.id !== account.id) throw new Error(`Số điện thoại demo đã được tài khoản khác sử dụng: ${account.phone}`);

  const customer: User = current
    ? { ...current, name: account.name, username: current.username || account.name, phone: account.phone, loyaltyPoints: account.loyaltyPoints }
    : { ...account, passwordHash: await hashPassword(demoCustomerPassword), role: "customer", blacklisted: false, hairHistory: [] };
  delete customer.email;
  repo.users.put(customer);
  if (current) existing += 1;
  else created += 1;
}

await repo.flush();
console.log(JSON.stringify({ storage: repo.storageType, created, alreadyPresent: existing, totalDemoAccounts: demoCustomerAccounts.length }, null, 2));
