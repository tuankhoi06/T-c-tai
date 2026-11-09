import React, { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { api } from "../api";
import type { Barber, WorkSchedule } from "../types";
import { Button, Card, colors, ErrorText, shopDate, styles } from "../ui";
import { Choice, DangerConfirm, DataState, DateField, FormModal, TimeField, useAdminList } from "./components";
import { StaffScheduleExtras } from "./staff_schedule_extras";

export function SchedulesAdmin({ active, barbers, preset }: { active: boolean; barbers: Barber[]; preset: { id: number; barberId: string } }) {
  const [barberId, setBarberId] = useState("");
  const [from, setFrom] = useState(shopDate());
  const [to, setTo] = useState(shopDate(14));
  const [editing, setEditing] = useState<WorkSchedule | "new" | null>(null);
  const [form, setForm] = useState({ barberId: "", date: shopDate(), startTime: "09:00", endTime: "18:00" });
  const [deleting, setDeleting] = useState<WorkSchedule | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  useEffect(() => { if (preset.id) setBarberId(preset.barberId); }, [preset.id]);
  const path = useMemo(() => {
    const p = new URLSearchParams(); if (barberId) p.set("barberId", barberId); if (from) p.set("from", from); if (to) p.set("to", to);
    return `/admin/work-schedules?${p}`;
  }, [barberId, from, to]);
  const validRange = !from || !to || from <= to;
  const list = useAdminList<WorkSchedule[]>(path, active && validRange);
  function open(item: WorkSchedule | "new") {
    setEditing(item); setError("");
    setForm(item === "new" ? { barberId: barberId || barbers.find((b) => b.active)?.id || "", date: from || shopDate(), startTime: "09:00", endTime: "18:00" } : { barberId: item.barberId, date: item.date, startTime: item.startTime, endTime: item.endTime });
  }
  async function save() {
    if (!editing || busy) return;
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
  const groups = (list.data || []).reduce<Record<string, WorkSchedule[]>>((all, item) => { (all[item.date] ||= []).push(item); return all; }, {});
  return <View style={{ gap: 12 }}>
    <Text style={styles.subtitle}>Lịch làm việc</Text>
    <View style={styles.row}><Button title="Thêm ca" onPress={() => open("new")} /><Button title="Làm mới" secondary disabled={list.loading} onPress={() => void list.reload()} /></View>
    {!!success && <Text style={{ color: colors.success }}>{success}</Text>}<ErrorText message={!editing ? error : ""} />
    <Text style={styles.muted}>Thợ</Text><Choice value={barberId} onChange={setBarberId} options={[{ label: "Tất cả", value: "" }, ...barbers.map((b) => ({ label: b.name, value: b.id }))]} />
    <DateField label="Từ ngày" value={from} onChange={setFrom} /><DateField label="Đến ngày" value={to} onChange={setTo} />
    {from && to && from > to && <ErrorText message="Ngày bắt đầu phải trước hoặc bằng ngày kết thúc." />}
    <View style={styles.row}><Button title="Hôm nay" secondary onPress={() => { setFrom(shopDate()); setTo(shopDate()); }} /><Button title="Xóa bộ lọc" secondary onPress={() => { setBarberId(""); setFrom(""); setTo(""); }} /></View>
    {validRange && <DataState loading={list.loading} error={list.error} retry={() => void list.reload()} empty={list.data?.length === 0} />}
    {validRange && !list.error && Object.entries(groups).map(([date, entries]) => <View key={date} style={{ gap: 8 }}><Text style={styles.subtitle}>{date}</Text>{entries.map((item) => <Card key={item.id}>
      <Text style={styles.text}>{barbers.find((b) => b.id === item.barberId)?.name || item.barberId} · {item.startTime}–{item.endTime}</Text>
      <Text style={styles.muted}>{item.activeAppointmentCount || 0} lịch đang hiệu lực trong ca</Text>
      <View style={styles.row}><Button title="Sửa ca" secondary onPress={() => open(item)} /><Button title="Xóa ca" secondary onPress={() => { setError(""); setDeleting(item); }} /></View>
    </Card>)}</View>)}
    <FormModal title={editing === "new" ? "Thêm ca làm việc" : "Sửa ca làm việc"} visible={!!editing} onClose={() => { if (!busy) setEditing(null); }}>
      <ErrorText message={error} /><Text style={styles.muted}>Thợ</Text>
      <Choice value={form.barberId} onChange={(barberId) => setForm({ ...form, barberId })} options={barbers.map((b) => ({ label: b.name, value: b.id }))} />
      <DateField label="Ngày làm việc" value={form.date} onChange={(date) => setForm({ ...form, date })} />
      <TimeField label="Bắt đầu" value={form.startTime} onChange={(startTime) => setForm({ ...form, startTime })} />
      <TimeField label="Kết thúc" value={form.endTime} onChange={(endTime) => setForm({ ...form, endTime })} />
      <Button title={busy ? "Đang lưu..." : "Lưu ca"} disabled={busy} onPress={() => void save()} />
    </FormModal>
    <DangerConfirm title="Xóa ca làm việc" message={`Ca có ${deleting?.activeAppointmentCount || 0} lịch đang hiệu lực. Backend sẽ từ chối nếu xóa làm lịch hẹn mất ca phù hợp.`} visible={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => void remove()} busy={busy} />
    <StaffScheduleExtras active={active} barbers={barbers} onChanged={() => void list.reload()} />
  </View>;
}
