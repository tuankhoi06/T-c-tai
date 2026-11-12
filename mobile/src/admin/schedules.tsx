import React, { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { api } from "../api";
import type { Barber, TimeBlock, WorkSchedule } from "../types";
import { Button, Card, ComboBox, colors, DragScrollView, ErrorText, Field, shopDate, styles } from "../ui";
import { DangerConfirm, DataState, DateField, FormModal, TimeField, useAdminList } from "./components";
import { StaffScheduleExtras } from "./staff_schedule_extras";

const weekdayNames = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
function shiftDate(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
function mondayOf(value: string) {
  const weekday = new Date(`${value}T12:00:00Z`).getUTCDay();
  return shiftDate(value, weekday === 0 ? -6 : 1 - weekday);
}
function dayName(value: string) { return weekdayNames[new Date(`${value}T12:00:00Z`).getUTCDay()]; }
function shiftMonth(value: string, amount: number) {
  const date = new Date(`${value.slice(0, 7)}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 10);
}

function SidebarAction({ title, onPress, secondary = false, disabled = false }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, secondary && styles.buttonSecondary, { width: "100%", minWidth: 0, paddingHorizontal: 6, opacity: disabled ? 0.45 : 1 }]}>
    <Text style={[styles.buttonText, secondary && { color: colors.text }, { fontSize: 13 }]} numberOfLines={2}>{title}</Text>
  </Pressable>;
}

export function SchedulesAdmin({ active, barbers, preset }: { active: boolean; barbers: Barber[]; preset: { id: number; barberId: string } }) {
  const { width: viewportWidth } = useWindowDimensions();
  const wideLayout = viewportWidth >= 920;
  const [barberId, setBarberId] = useState("");
  const [weekStart, setWeekStart] = useState(mondayOf(shopDate()));
  const [selectedDate, setSelectedDate] = useState(shopDate());
  const [monthStart, setMonthStart] = useState(`${shopDate().slice(0, 7)}-01`);
  const [editing, setEditing] = useState<WorkSchedule | "new" | null>(null);
  const [form, setForm] = useState({ barberId: "", date: shopDate(), startTime: "09:00", endTime: "18:00" });
  const [deleting, setDeleting] = useState<WorkSchedule | null>(null);
  const [blockFormOpen, setBlockFormOpen] = useState(false);
  const [blockForm, setBlockForm] = useState({ barberId: "", date: shopDate(), startTime: "12:00", endTime: "13:00", reason: "" });
  const [deletingBlock, setDeletingBlock] = useState<TimeBlock | null>(null);
  const [busy, setBusy] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [error, setError] = useState("");
  const [blockError, setBlockError] = useState("");
  const [success, setSuccess] = useState("");
  const [autoBusy, setAutoBusy] = useState(false);
  const [confirmAuto, setConfirmAuto] = useState(false);

  useEffect(() => { if (preset.id) { const today = shopDate(); setBarberId(preset.barberId); setWeekStart(mondayOf(today)); setSelectedDate(today); setMonthStart(`${today.slice(0, 7)}-01`); } }, [preset.id]);
  const weekEnd = shiftDate(weekStart, 6);
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, index) => shiftDate(weekStart, index)), [weekStart]);
  const monthDates = useMemo(() => {
    const firstWeek = mondayOf(monthStart);
    return Array.from({ length: 42 }, (_, index) => shiftDate(firstWeek, index));
  }, [monthStart]);
  const schedulePath = useMemo(() => {
    const query = new URLSearchParams({ from: monthDates[0], to: monthDates[41] });
    if (barberId) query.set("barberId", barberId);
    return `/admin/work-schedules?${query}`;
  }, [monthDates, barberId]);
  const blocksPath = useMemo(() => {
    const query = new URLSearchParams({ from: monthDates[0], to: monthDates[41] });
    if (barberId) query.set("barberId", barberId);
    return `/admin/blocks?${query}`;
  }, [monthDates, barberId]);
  const list = useAdminList<WorkSchedule[]>(schedulePath, active);
  const blocks = useAdminList<TimeBlock[]>(blocksPath, active);
  const options = barbers.filter((item) => item.active).sort((a, b) => a.name.localeCompare(b.name, "vi"));
  const barberChoices = options.map((item) => ({ label: item.name, value: item.id }));
  const schedulesByDate = (list.data || []).reduce<Record<string, WorkSchedule[]>>((all, item) => { (all[item.date] ||= []).push(item); return all; }, {});
  const blocksByDate = (blocks.data || []).reduce<Record<string, TimeBlock[]>>((all, item) => { (all[item.date] ||= []).push(item); return all; }, {});
  const count = (list.data || []).filter((item) => item.date >= weekStart && item.date <= weekEnd).length;

  function open(item: WorkSchedule | "new", date = selectedDate) {
    setError("");
    if (item === "new" && date < shopDate()) {
      setError("Không thể thêm ca vì ngày đã qua. Hãy chọn hôm nay hoặc một ngày trong tương lai.");
      return;
    }
    setEditing(item);
    setForm(item === "new"
      ? { barberId: barberId || options[0]?.id || "", date, startTime: "09:00", endTime: "18:00" }
      : { barberId: item.barberId, date: item.date, startTime: item.startTime, endTime: item.endTime });
  }
  async function save() {
    if (!editing || busy) return;
    if (editing === "new" && form.date && form.date < shopDate()) { setError("Không thể thêm ca vì ngày đã qua. Hãy chọn hôm nay hoặc một ngày trong tương lai."); return; }
    if (!form.barberId || !form.date || !form.startTime || !form.endTime || form.startTime >= form.endTime) { setError("Chọn thợ, ngày và giờ kết thúc sau giờ bắt đầu."); return; }
    setBusy(true); setError(""); setSuccess("");
    try {
      const isNew = editing === "new";
      await api(isNew ? "/admin/work-schedules" : `/admin/work-schedules/${editing.id}`, { method: isNew ? "POST" : "PATCH", body: form });
      setEditing(null); setSuccess(isNew ? "Đã thêm ca làm việc." : "Đã sửa ca làm việc."); await list.reload();
    } catch (err: any) { setError(err.message || "Không lưu được ca làm việc."); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!deleting || busy) return;
    setBusy(true); setError(""); setSuccess("");
    try { await api(`/admin/work-schedules/${deleting.id}`, { method: "DELETE" }); setDeleting(null); setSuccess("Đã xóa ca làm việc."); await list.reload(); }
    catch (err: any) { setError(err.message || "Không xóa được ca làm việc."); setDeleting(null); }
    finally { setBusy(false); }
  }
  async function addBlock() {
    if (blockBusy) return;
    if (!blockForm.barberId || blockForm.startTime >= blockForm.endTime || blockForm.reason.trim().length < 2) { setBlockError("Chọn thợ, giờ hợp lệ và nhập lý do chặn."); return; }
    setBlockBusy(true); setBlockError(""); setSuccess("");
    try {
      await api("/admin/blocks", { method: "POST", body: { ...blockForm, reason: blockForm.reason.trim() } });
      setBlockFormOpen(false); setSuccess("Đã chặn khung giờ bận."); await blocks.reload();
    } catch (err: any) { setBlockError(err.message || "Không chặn được giờ."); }
    finally { setBlockBusy(false); }
  }
  async function removeBlock() {
    if (!deletingBlock || blockBusy) return;
    setBlockBusy(true); setBlockError("");
    try { await api(`/admin/blocks/${deletingBlock.id}`, { method: "DELETE" }); setDeletingBlock(null); setSuccess("Đã mở lại khung giờ."); await blocks.reload(); }
    catch (err: any) { setBlockError(err.message || "Không mở lại được giờ."); setDeletingBlock(null); }
    finally { setBlockBusy(false); }
  }
  async function autoSchedule() {
    if (autoBusy || !confirmAuto) return;
    const from = shopDate(), to = shopDate(30);
    setAutoBusy(true); setError(""); setSuccess("");
    try {
      const result = await api<{ createdCount: number; skippedLeaveCount: number; skippedExistingCount: number; defaultBarberCount: number }>("/admin/work-schedules/auto", {
        method: "POST", body: { from, to, ...(barberId ? { barberId } : {}) }
      });
      setSuccess(`${result.defaultBarberCount ? `Áp dụng ca mặc định Thứ 2–Thứ 7, 09:00–18:00 cho ${result.defaultBarberCount} thợ chưa có mẫu. ` : ""}Đã xếp ${result.createdCount} ca; bỏ qua ${result.skippedExistingCount} ca đã có và ${result.skippedLeaveCount} ngày có đơn nghỉ.`);
      setConfirmAuto(false); await list.reload();
    } catch (err: any) { setError(err.message || "Không tự xếp được ca."); }
    finally { setAutoBusy(false); }
  }

  return <View style={{ gap: 12 }}>
    <Text style={styles.subtitle}>Lịch ca theo tuần</Text>
    {!!success && <Text style={{ color: colors.success }}>{success}</Text>}
    <ErrorText message={error} />
    <View style={{ flexDirection: wideLayout ? "row" : "column", alignItems: "flex-start", gap: 14 }}>
      <View style={{ width: wideLayout ? 270 : "100%", gap: 12, flexShrink: 0 }}>
        <ComboBox label="Lọc theo thợ" value={barberId} onChange={setBarberId} options={[{ label: "Tất cả thợ", value: "" }, ...barberChoices]} searchable searchPlaceholder="Tìm tên thợ" />
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1, minWidth: 0 }}><SidebarAction title="＋ Thêm ca" onPress={() => open("new")} /></View>
            <View style={{ flex: 1, minWidth: 0 }}><SidebarAction title="▧ Chặn giờ" secondary onPress={() => { setBlockForm({ barberId: barberId || options[0]?.id || "", date: selectedDate, startTime: "12:00", endTime: "13:00", reason: "" }); setBlockError(""); setBlockFormOpen(true); }} /></View>
          </View>
          <SidebarAction title={autoBusy ? "Đang xếp..." : "Tự động xếp 1 tháng"} secondary disabled={autoBusy} onPress={() => setConfirmAuto(true)} />
          <SidebarAction title="Làm mới lịch" secondary disabled={list.loading || blocks.loading} onPress={() => { void list.reload(); void blocks.reload(); }} />
        </View>
        <Text style={styles.muted}>Chọn ngày để xem ca. Chạm vào ca để sửa; có thể thêm giờ chặn hoặc mở lại giờ đã chặn.</Text>
        <Card style={{ width: "100%", padding: 12, gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={[styles.text, { fontWeight: "800" }]}>Tháng {monthStart.slice(5, 7)}-{monthStart.slice(0, 4)}</Text>
            <View style={{ flexDirection: "row", gap: 6 }}>
              <Pressable accessibilityRole="button" accessibilityLabel="Tháng trước" hitSlop={4} onPress={() => setMonthStart((value) => shiftMonth(value, -1))} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: colors.input }}><Text style={{ color: colors.gold, fontSize: 23 }}>‹</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Tháng sau" hitSlop={4} onPress={() => setMonthStart((value) => shiftMonth(value, 1))} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: colors.input }}><Text style={{ color: colors.gold, fontSize: 23 }}>›</Text></Pressable>
            </View>
          </View>
          <View style={{ flexDirection: "row" }}>{["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((label) => <Text key={label} style={[styles.muted, { width: "14.285%", textAlign: "center", fontSize: 11 }]}>{label}</Text>)}</View>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {monthDates.map((date) => {
              const inMonth = date.slice(0, 7) === monthStart.slice(0, 7);
              const isSelected = date === selectedDate;
              const hasSchedule = !!schedulesByDate[date]?.length || !!blocksByDate[date]?.length;
              return <Pressable key={date} accessibilityRole="button" accessibilityLabel={date} hitSlop={1} onPress={() => { setSelectedDate(date); setWeekStart(mondayOf(date)); if (!inMonth) setMonthStart(`${date.slice(0, 7)}-01`); }} style={{ width: "14.285%", height: 44, alignItems: "center", justifyContent: "center" }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: isSelected ? colors.gold : date === shopDate() ? colors.card : "transparent", borderWidth: date === shopDate() && !isSelected ? 1 : 0, borderColor: colors.gold }}>
                  <Text style={{ color: isSelected ? colors.dark : inMonth ? colors.text : colors.muted, fontSize: 12, fontWeight: isSelected || date === shopDate() ? "800" : "500" }}>{Number(date.slice(8, 10))}</Text>
                </View>
                {hasSchedule && <View style={{ position: "absolute", bottom: 1, width: 4, height: 4, borderRadius: 2, backgroundColor: isSelected ? colors.gold : colors.danger }} />}
              </Pressable>;
            })}
          </View>
          <Text style={styles.muted}>● Có ca hoặc giờ chặn · Chọn ngày để mở tuần tương ứng</Text>
        </Card>
      </View>

      <View style={{ flex: 1, width: wideLayout ? undefined : "100%", minWidth: 0, gap: 12 }}>
        <View style={[styles.row, { alignItems: "center", justifyContent: "space-between" }]}>
          <View style={[styles.row, { alignItems: "center", gap: 6 }]}>
            <Pressable accessibilityRole="button" accessibilityLabel="Tuần trước" onPress={() => { const next = shiftDate(weekStart, -7); setWeekStart(next); setSelectedDate(next); setMonthStart(`${next.slice(0, 7)}-01`); }} style={{ width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}><Text style={{ color: colors.text, fontSize: 23, lineHeight: 27 }}>‹</Text></Pressable>
            <Button title="Tuần này" secondary onPress={() => { const today = shopDate(); setWeekStart(mondayOf(today)); setSelectedDate(today); setMonthStart(`${today.slice(0, 7)}-01`); }} />
            <Pressable accessibilityRole="button" accessibilityLabel="Tuần sau" onPress={() => { const next = shiftDate(weekStart, 7); setWeekStart(next); setSelectedDate(next); setMonthStart(`${next.slice(0, 7)}-01`); }} style={{ width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}><Text style={{ color: colors.text, fontSize: 23, lineHeight: 27 }}>›</Text></Pressable>
          </View>
          <Text style={styles.muted}>{weekStart} — {weekEnd} · {count} ca</Text>
        </View>
        <DataState loading={list.loading || blocks.loading} error={list.error || blocks.error} retry={() => { void list.reload(); void blocks.reload(); }} empty={count === 0 && (blocks.data || []).length === 0} />
        {!list.error && !blocks.error && <DragScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 9, paddingBottom: 8 }}>
          {weekDates.map((date) => {
            const daySchedules = (schedulesByDate[date] || []).sort((a, b) => a.startTime.localeCompare(b.startTime));
            const dayBlocks = (blocksByDate[date] || []).sort((a, b) => a.startTime.localeCompare(b.startTime));
            const isToday = date === shopDate();
            return <View key={date} style={{ width: 218, minHeight: 370, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: selectedDate === date ? colors.gold : colors.border, padding: 10, gap: 8 }}>
              <Pressable onPress={() => setSelectedDate(date)} style={{ paddingBottom: 8, borderBottomWidth: 1, borderColor: colors.border }}>
                <Text style={{ color: isToday ? colors.gold : colors.text, fontSize: 15, fontWeight: "800" }}>{dayName(date)}{isToday ? " · Hôm nay" : ""}</Text>
                <Text style={styles.muted}>{date} · {daySchedules.length} ca</Text>
              </Pressable>
              {!daySchedules.length && !dayBlocks.length && <Text style={[styles.muted, { paddingVertical: 8 }]}>Chưa có ca</Text>}
              {daySchedules.map((item) => <Pressable key={item.id} onPress={() => { setSelectedDate(date); open(item); }} style={{ backgroundColor: colors.input, borderLeftWidth: 3, borderLeftColor: colors.gold, borderRadius: 9, padding: 9, gap: 3 }}>
                <Text style={[styles.text, { fontWeight: "700", fontSize: 13 }]} numberOfLines={1}>{barbers.find((b) => b.id === item.barberId)?.name || item.barberId}</Text>
                <Text style={{ color: colors.gold, fontSize: 12, fontWeight: "700" }}>{item.startTime}–{item.endTime}</Text>
                <Text style={[styles.muted, { fontSize: 11 }]}>{item.activeAppointmentCount || 0} lịch hẹn</Text>
                <View style={styles.row}><Text style={{ color: colors.text, fontSize: 11 }}>Chạm để sửa</Text><Text style={{ color: colors.gold, fontSize: 11 }}>›</Text></View>
              </Pressable>)}
              {dayBlocks.map((item) => <View key={item.id} style={{ backgroundColor: "#54352A", borderLeftWidth: 3, borderLeftColor: colors.danger, borderRadius: 9, padding: 9, gap: 3 }}>
                <Text style={{ color: colors.danger, fontSize: 12, fontWeight: "800" }}>Đã chặn · {item.startTime}–{item.endTime}</Text>
                <Text style={[styles.muted, { fontSize: 11 }]}>{barbers.find((b) => b.id === item.barberId)?.name} · {item.reason}</Text>
                <Button title="Mở lại giờ" secondary onPress={() => setDeletingBlock(item)} />
              </View>)}
              <Button title="＋ Thêm ca ngày này" secondary onPress={() => { setSelectedDate(date); open("new", date); }} />
            </View>;
          })}
        </DragScrollView>}
        <StaffScheduleExtras active={active} barbers={barbers} onChanged={() => { void list.reload(); void blocks.reload(); }} />
      </View>
    </View>

    <FormModal title={editing === "new" ? "Thêm ca làm việc" : "Sửa ca làm việc"} visible={!!editing} onClose={() => { if (!busy) setEditing(null); }}>
      <ErrorText message={error} />
      <ComboBox label="Thợ" value={form.barberId} onChange={(value) => setForm({ ...form, barberId: value })} options={barberChoices} searchable searchPlaceholder="Tìm tên thợ" />
      <DateField label="Ngày làm việc" value={form.date} onChange={(value) => setForm({ ...form, date: value })} />
      <TimeField label="Bắt đầu" value={form.startTime} onChange={(value) => setForm({ ...form, startTime: value })} />
      <TimeField label="Kết thúc" value={form.endTime} onChange={(value) => setForm({ ...form, endTime: value })} />
      <Button title={busy ? "Đang lưu..." : "Lưu ca"} disabled={busy} onPress={() => void save()} />
      {editing !== "new" && <Button title="Xóa ca này" secondary disabled={busy} onPress={() => { setDeleting(editing); setEditing(null); }} />}
    </FormModal>
    <FormModal title="Chặn giờ bận" visible={blockFormOpen} onClose={() => { if (!blockBusy) setBlockFormOpen(false); }}>
      <ErrorText message={blockError} />
      <ComboBox label="Thợ" value={blockForm.barberId} onChange={(value) => setBlockForm({ ...blockForm, barberId: value })} options={barberChoices} searchable searchPlaceholder="Tìm tên thợ" />
      <DateField label="Ngày" value={blockForm.date} onChange={(value) => setBlockForm({ ...blockForm, date: value })} />
      <TimeField label="Từ giờ" value={blockForm.startTime} onChange={(value) => setBlockForm({ ...blockForm, startTime: value })} />
      <TimeField label="Đến giờ" value={blockForm.endTime} onChange={(value) => setBlockForm({ ...blockForm, endTime: value })} />
      <Field label="Lý do" value={blockForm.reason} onChange={(value) => setBlockForm({ ...blockForm, reason: value })} />
      <Button title={blockBusy ? "Đang lưu..." : "Chặn khung giờ"} disabled={blockBusy} onPress={() => void addBlock()} />
    </FormModal>
    <FormModal title="Xác nhận tự động xếp ca" visible={confirmAuto} onClose={() => { if (!autoBusy) setConfirmAuto(false); }}>
      <Text style={styles.text}>Tạo ca từ {shopDate()} đến {shopDate(30)}{barberId ? ` cho ${options.find((item) => item.id === barberId)?.name || "thợ đã chọn"}` : " cho tất cả thợ đang hoạt động"}.</Text>
      <Text style={styles.muted}>Ca đã có và ngày có đơn nghỉ sẽ được bỏ qua; bấm lại không sinh ca trùng.</Text>
      <View style={styles.row}><Button title={autoBusy ? "Đang xếp..." : "Xác nhận xếp ca"} disabled={autoBusy} onPress={() => void autoSchedule()} /><Button title="Hủy" secondary disabled={autoBusy} onPress={() => setConfirmAuto(false)} /></View>
    </FormModal>
    <DangerConfirm title="Xóa ca làm việc" message={`Ca có ${deleting?.activeAppointmentCount || 0} lịch đang hiệu lực. Backend sẽ từ chối nếu xóa làm lịch hẹn mất ca phù hợp.`} visible={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => void remove()} busy={busy} />
    <DangerConfirm title="Mở lại giờ đã chặn" message={`${deletingBlock?.date} · ${deletingBlock?.startTime}–${deletingBlock?.endTime} · ${deletingBlock?.reason}`} visible={!!deletingBlock} onClose={() => setDeletingBlock(null)} onConfirm={() => void removeBlock()} busy={blockBusy} />
  </View>;
}
