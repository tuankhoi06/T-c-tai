import type { SupabaseClient } from "@supabase/supabase-js";
import { MemoryRepository } from "./repository.js";

type StoredRecord = { id: string };
type Collection<T extends StoredRecord> = {
  all(): T[];
  get(id: string): T | undefined;
  put(item: T): void;
  remove(id: string): void;
};

export class SupabaseRepository extends MemoryRepository {
  override readonly storageType = "supabase" as const;

  private pendingWrites = new Map<string, Map<string, StoredRecord | null>>();
  private flushPromise: Promise<void> | null = null;
  private writeFailed = false;
  private loading = false;

  constructor(private readonly client: SupabaseClient) {
    super();

    const users = this.users;
    this.users = {
      ...users,
      ...this.persistedCollection("hairmatch_users", users)
    };
    this.services = this.persistedCollection("hairmatch_services", this.services);
    this.barbers = this.persistedCollection("hairmatch_barbers", this.barbers);
    this.schedules = this.persistedCollection("hairmatch_schedules", this.schedules);
    this.appointments = this.persistedCollection("hairmatch_appointments", this.appointments);
    this.blocks = this.persistedCollection("hairmatch_blocks", this.blocks);
    this.leaves = this.persistedCollection("hairmatch_leaves", this.leaves);
    this.weeklyShifts = this.persistedCollection("hairmatch_weekly_shifts", this.weeklyShifts);
    this.vouchers = this.persistedCollection("hairmatch_vouchers", this.vouchers);
    this.notifications = this.persistedCollection("hairmatch_notifications", this.notifications);
    this.pushDevices = this.persistedCollection("hairmatch_push_devices", this.pushDevices);
    this.supportMessages = this.persistedCollection("hairmatch_support_messages", this.supportMessages);
    this.adminSettings = this.persistedCollection("hairmatch_admin_settings", this.adminSettings);
  }

  async initialize() {
    this.loading = true;
    try {
      for (const [table, collection] of this.tables()) {
        for (let offset = 0; ; offset += 1000) {
          const { data, error } = await this.client
            .from(table)
            .select("id,payload")
            .order("id")
            .range(offset, offset + 999);

          if (error) throw new Error(`Could not load Supabase table ${table}.`);
          for (const row of data || []) collection.put(row.payload as StoredRecord);
          if ((data || []).length < 1000) break;
        }
      }
    } finally {
      this.loading = false;
    }
  }

  flush() {
    if (!this.flushPromise) {
      this.flushPromise = this.flushPendingWrites().finally(() => {
        this.flushPromise = null;
      });
    }
    return this.flushPromise;
  }

  private async flushPendingWrites() {
    while (this.pendingWrites.size > 0) {
      const batch = this.pendingWrites;
      this.pendingWrites = new Map();
      try {
        await this.persistBatch(batch);
      } catch {
        for (const [table, rows] of batch) {
          const pendingTable = this.pendingWrites.get(table) || new Map<string, StoredRecord | null>();
          for (const [id, record] of rows) if (!pendingTable.has(id)) pendingTable.set(id, record);
          this.pendingWrites.set(table, pendingTable);
        }
        this.writeFailed = true;
        break;
      }
    }
    if (this.writeFailed) {
      this.writeFailed = false;
      throw new Error("Không lưu được dữ liệu vào Supabase. Kiểm tra cấu hình và migration.");
    }
  }

  private tables(): Array<[string, Collection<StoredRecord>]> {
    return [
      ["hairmatch_users", this.users],
      ["hairmatch_services", this.services],
      ["hairmatch_barbers", this.barbers],
      ["hairmatch_schedules", this.schedules],
      ["hairmatch_appointments", this.appointments],
      ["hairmatch_blocks", this.blocks],
      ["hairmatch_leaves", this.leaves],
      ["hairmatch_weekly_shifts", this.weeklyShifts],
      ["hairmatch_vouchers", this.vouchers],
      ["hairmatch_notifications", this.notifications],
      ["hairmatch_push_devices", this.pushDevices],
      ["hairmatch_support_messages", this.supportMessages],
      ["hairmatch_admin_settings", this.adminSettings]
    ];
  }

  private persistedCollection<T extends StoredRecord>(table: string, collection: Collection<T>): Collection<T> {
    return {
      all: () => collection.all(),
      get: (id) => collection.get(id),
      put: (item) => {
        collection.put(item);
        if (!this.loading) this.queueWrite(table, item.id, item);
      },
      remove: (id) => {
        collection.remove(id);
        if (!this.loading) this.queueWrite(table, id, null);
      }
    };
  }

  private queueWrite(table: string, id: string, record: StoredRecord | null) {
    const tableWrites = this.pendingWrites.get(table) || new Map<string, StoredRecord | null>();
    tableWrites.set(id, record);
    this.pendingWrites.set(table, tableWrites);
  }

  private async persistBatch(batch: Map<string, Map<string, StoredRecord | null>>) {
    await Promise.all([...batch].map(async ([table, rows]) => {
      const records = [...rows.values()].filter((record): record is StoredRecord => record !== null);
      const deletedIds = [...rows].filter(([, record]) => record === null).map(([id]) => id);

      if (records.length) {
        const { error } = await this.client.from(table).upsert(
          records.map((record) => ({ id: record.id, payload: record, updated_at: new Date().toISOString() })),
          { onConflict: "id" }
        );
        if (error) throw error;
      }
      if (deletedIds.length) {
        const { error } = await this.client.from(table).delete().in("id", deletedIds);
        if (error) throw error;
      }
    }));
  }
}
