import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { api } from "../api";
import type { Appointment, Barber, TimeBlock } from "../types";
import { Button, Card, ErrorText, Field, colors, shopDate, styles } from "../ui";
import { Choice, DateField, FormModal, TimeField, useAdminList } from "./components";

const hourStart = 8, hourEnd = 21, unit = 84;
const statusColor: Record<string, string> = {
  pending: colors.statusPending, confirmed: colors.statusConfirmed, in_progress: colors.statusInProgress,
  completed: colors.statusCompleted, cancelled: colors.statusCancelled, no_show: colors.statusNoShow
};
function minuteOfDay(iso: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const get = (key: string) => Number(parts.find((part) => part.type === key)?.value || 0);
  return get("hour") * 60 + get("minute");
}
const position = (minutes: number) => (minutes - hourStart * 60) * unit / 60;

export function AdminTimeline({ active, barbers, onOpen }: { active: boolean; barbers: Barber[]; onOpen: (item: Appointment) => void }) {
  const [day, setDay] = useState(shopDate());
  const [refresh, setRefresh] = useState(0);
  const [clockMs, setClockMs] = useState(Date.now());
  const [formOpen, setFormOpen] = useState(false);
  const [barberId, setBarberId] = useState("");
  const [startTime, setStartTime] = useState("12:00");
  const [endTime, setEndTime] = useState("13:00");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const appointments = useAdminList<Appointment[]>(`/admin/appointments?date=${day}&refresh=${refresh}`, active);
  const blocks = useAdminList<TimeBlock[]>(`/admin/blocks?date=${day}&refresh=${refresh}`, active);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => { setClockMs(Date.now()); void appointments.reload(true); void blocks.reload(true); }, 15000);
    return () => clearInterval(timer);
  }, [active, appointments.reload, blocks.reload]);
  async function addBlock() {
    if (busy) return;
    if (!barberId || !reason.trim() || startTime >= endTime) { setError("Chọn thợ, nhập lý do và giờ kết thúc sau giờ bắt đầu."); return; }
    setBusy(true); setError("");
    try {
      await api("/admin/blocks", { method: "POST", body: { barberId, date: day, startTime, endTime, reason: reason.trim() } });
      setFormOpen(false); setReason(""); setRefresh((value) => value + 1);
    } catch (err: any) { setError(err.message || "Không chặn được giờ."); }
    finally { setBusy(false); }
  }
  async function removeBlock(id: string) {
    try { await api(`/admin/blocks/${id}`, { method: "DELETE" }); setRefresh((value) => value + 1); }
    catch (err: any) { setError(err.message || "Không mở lại được giờ."); }
  }
  const visibleBarbers = barbers.filter((barber) => barber.active);
  const width = (hourEnd - hourStart) * unit;
  const currentMinute = minuteOfDay(new Date(clockMs).toISOString());
  const showCurrentTime = day === shopDate() && currentMinute >= hourStart * 60 && currentMinute < hourEnd * 60;
  return <Card style={{ gap: 12 }}>
    <Text style={styles.subtitle}>Lịch theo giờ · từng thợ</Text>
    <Text style={styles.muted}>Chạm lịch để xử lý nhanh · vạch đỏ là giờ hiện tại · kéo ngang để xem hết ngày.</Text>
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10 }}>
      <View style={{ flex: 1, minWidth: 0 }}><DateField label="Ngày trên lịch" value={day} onChange={setDay} /></View>
      <Button title="Chặn giờ bận" secondary onPress={() => { setBarberId(visibleBarbers[0]?.id || ""); setError(""); setFormOpen(true); }} />
    </View>
    <ErrorText message={error || appointments.error || blocks.error} />
    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ paddingBottom: 6 }}>
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: "row", marginLeft: 92 }}>{Array.from({ length: hourEnd - hourStart }, (_, index) => <Text key={index} style={[styles.muted, { width: unit, fontSize: 11 }]}>{String(hourStart + index).padStart(2, "0")}:00</Text>)}</View>
        {visibleBarbers.map((barber) => <View key={barber.id} style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={[styles.text, { width: 92, fontSize: 13, fontWeight: "700" }]} numberOfLines={1}>{barber.name}</Text>
          <View style={{ width, height: 66, backgroundColor: colors.dark, borderRadius: 8, overflow: "hidden" }}>
            {Array.from({ length: hourEnd - hourStart }, (_, index) => <View key={index} style={{ position: "absolute", left: index * unit, top: 0, height: 66, borderLeftWidth: 1, borderColor: colors.border }} />)}
            {(blocks.data || []).filter((block) => block.barberId === barber.id).map((block) => <View key={block.id} style={{ position: "absolute", left: position(Number(block.startTime.slice(0, 2)) * 60 + Number(block.startTime.slice(3))), width: Math.max(28, (Number(block.endTime.slice(0, 2)) * 60 + Number(block.endTime.slice(3)) - Number(block.startTime.slice(0, 2)) * 60 - Number(block.startTime.slice(3))) * unit / 60), top: 8, height: 50, backgroundColor: colors.statusCancelled, borderRadius: 7, padding: 4 }}><Text style={[styles.muted, { color: colors.text, fontSize: 10 }]} numberOfLines={2}>{block.reason}</Text></View>)}
            {(appointments.data || []).filter((item) => item.barberId === barber.id).map((item) => <Pressable key={item.id} onPress={() => onOpen(item)} style={{ position: "absolute", left: position(minuteOfDay(item.startAt)), width: Math.max(35, (minuteOfDay(item.endAt) - minuteOfDay(item.startAt)) * unit / 60 - 2), top: 6, height: 54, backgroundColor: statusColor[item.status], borderRadius: 8, padding: 5, borderWidth: 1, borderColor: "#ffffff55" }}><Text style={{ color: "#fff", fontWeight: "700", fontSize: 10 }} numberOfLines={2}>{item.customerNameSnapshot}</Text><Text style={{ color: "#fff", fontSize: 9 }} numberOfLines={1}>{item.serviceNameSnapshot}</Text></Pressable>)}
            {showCurrentTime && <View pointerEvents="none" style={{ position: "absolute", zIndex: 10, left: position(currentMinute), top: 0, bottom: 0, width: 2, backgroundColor: colors.danger }} />}
          </View>
        </View>)}
      </View>
    </ScrollView>
    <View style={styles.row}>{Object.entries(statusColor).map(([status, color]) => <View key={status} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: color }} /><Text style={[styles.muted, { fontSize: 10 }]}>{({ pending: "Chờ", confirmed: "Xác nhận", in_progress: "Đang làm", completed: "Xong", cancelled: "Hủy", no_show: "Vắng" } as Record<string, string>)[status]}</Text></View>)}</View>
    {(blocks.data || []).length > 0 && <View style={{ gap: 5 }}><Text style={styles.muted}>Giờ đã chặn</Text>{blocks.data?.map((block) => <View key={block.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 7 }}><Text style={styles.muted}>{barbers.find((item) => item.id === block.barberId)?.name} · {block.startTime}–{block.endTime} · {block.reason}</Text><Button title="Mở lại" secondary onPress={() => void removeBlock(block.id)} /></View>)}</View>}
    <FormModal visible={formOpen} title="Chặn giờ bận" onClose={() => { if (!busy) setFormOpen(false); }}>
      <ErrorText message={error} /><Text style={styles.muted}>Thợ</Text><Choice value={barberId} onChange={setBarberId} options={visibleBarbers.map((item) => ({ label: item.name, value: item.id }))} />
      <Text style={styles.muted}>Ngày {day}</Text><TimeField label="Từ giờ" value={startTime} onChange={setStartTime} /><TimeField label="Đến giờ" value={endTime} onChange={setEndTime} /><Field label="Lý do" value={reason} onChange={setReason} />
      <Button title={busy ? "Đang lưu..." : "Chặn giờ"} disabled={busy} onPress={() => void addBlock()} />
    </FormModal>
  </Card>;
}
