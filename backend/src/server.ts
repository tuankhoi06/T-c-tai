import { createApp } from "./app.js";
import { config } from "./config.js";
import { MemoryRepository } from "./repository.js";
import { SupabaseRepository } from "./supabase-repository.js";
import { startReminderWorker } from "./notifications.js";
import { createClient } from "@supabase/supabase-js";

const repo = config.SUPABASE_URL && config.SUPABASE_SECRET_KEY
  ? new SupabaseRepository(createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  }))
  : new MemoryRepository();

if (repo instanceof SupabaseRepository) {
  await repo.initialize();
  const hasData = [
    repo.users, repo.services, repo.barbers, repo.schedules, repo.appointments,
    repo.blocks, repo.leaves, repo.weeklyShifts, repo.vouchers, repo.notifications,
    repo.pushDevices, repo.supportMessages
  ].some((collection) => collection.all().length > 0);
  if (!hasData) await repo.seed();
  await repo.flush();
} else {
  await repo.seed();
}

startReminderWorker(repo);

const app = createApp(repo);

app.listen(config.PORT, "0.0.0.0", () => {
  console.log(
    `HairMatch backend đang chạy trên cổng ${config.PORT}`
  );
  console.log(`AI mode: ${config.AI_MODE}`);
  console.log(`Storage: ${repo.storageType}.`);
});

