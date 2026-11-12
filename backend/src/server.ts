import { createApp } from "./app.js";
import { config } from "./config.js";
import { MemoryRepository } from "./repository.js";
import { SupabaseRepository } from "./supabase-repository.js";
import { startReminderWorker } from "./notifications.js";
import { createClient } from "@supabase/supabase-js";
import { demoCustomerAccounts } from "./demo-customer-accounts.js";
import { mergeDuplicateCustomerAdminThreads } from "./support.js";

const repo = config.STORAGE_MODE === "memory"
  ? new MemoryRepository()
  : config.SUPABASE_URL && config.SUPABASE_SECRET_KEY
  ? new SupabaseRepository(createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  }))
  : new MemoryRepository();

if (repo instanceof SupabaseRepository) {
  await repo.initialize();
  // Carry the bundled demo identities forward from the former email login to phone login.
  const demoPhones = new Map([
    ["admin-demo", "0900000000"],
    ["customer-demo", "0911111111"],
    ["customer-lan", "0922222222"],
    ["customer-nam", "0933333333"],
    ...demoCustomerAccounts.map(({ id, phone }) => [id, phone] as const)
  ]);
  for (const user of repo.users.all()) {
    const phone = demoPhones.get(user.id);
    const migrated = { ...user, username: user.username || user.name, ...(phone ? { phone } : {}) };
    delete migrated.email;
    if (user.email || !user.username || (phone && user.phone !== phone)) repo.users.put(migrated);
  }
  // Barber profile is the canonical identity used across schedules, bookings and inbox.
  // Keep older demo accounts (and renamed staff accounts) aligned with that profile.
  const sampleBarberPhones: Record<string, string> = {
    "barber-1": "0900000201", "barber-2": "0900000202", "barber-3": "0900000203",
    "barber-4": "0900000204", "barber-5": "0900000205"
  };
  for (const barber of repo.barbers.all()) {
    if (!barber.phone && sampleBarberPhones[barber.id]) repo.barbers.put({ ...barber, phone: sampleBarberPhones[barber.id] });
  }
  for (const account of repo.users.all().filter((user) => user.role === "barber" && !!user.barberId)) {
    const barber = repo.barbers.get(account.barberId!);
    if (barber) {
      const phone = barber.phone || account.phone;
      const migrated = { ...account, name: barber.name, username: barber.name, phone };
      delete migrated.email;
      if (account.name !== barber.name || account.phone !== phone || account.username !== barber.name || account.email) repo.users.put(migrated);
      if (phone && barber.phone !== phone) repo.barbers.put({ ...barber, phone });
    }
  }
  const hasData = [
    repo.users, repo.services, repo.barbers, repo.schedules, repo.appointments,
    repo.blocks, repo.leaves, repo.weeklyShifts, repo.vouchers, repo.notifications,
    repo.pushDevices, repo.supportMessages, repo.adminSettings
  ].some((collection) => collection.all().length > 0);
  if (!hasData) await repo.seed();
  await repo.flush();
} else {
  await repo.seed();
}

mergeDuplicateCustomerAdminThreads(repo);
if (repo instanceof SupabaseRepository) await repo.flush();

startReminderWorker(repo);

const app = createApp(repo);

app.listen(config.PORT, "0.0.0.0", () => {
  console.log(
    `HairMatch backend đang chạy trên cổng ${config.PORT}`
  );
  console.log(`AI mode: ${config.AI_MODE}`);
  console.log(`Storage: ${repo.storageType}.`);
});

