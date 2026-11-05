import { createApp } from "./app.js";
import { config } from "./config.js";
import { MemoryRepository } from "./repository.js";

const repo = new MemoryRepository();
await repo.seed();

const app = createApp(repo);

app.listen(config.PORT, "0.0.0.0", () => {
  console.log(
    `HairMatch backend đang chạy trên cổng ${config.PORT}`
  );
  console.log(`AI mode: ${config.AI_MODE}`);
  console.log("Storage: in-memory, dữ liệu mất khi restart.");
});

