import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api } from "../api";
import type { Barber, WeeklyShift } from "../types";
import { Button, Card, ComboBox, colors, ErrorText, shopDate, styles } from "../ui";
import { Choice, DataState, DateField, TimeField, useAdminList } from "./components";

const weekdays = [{ label: "Thứ 2", value: "1" }, { label: "Thứ 3", value: "2" }, { label: "Thứ 4", value: "3" }, { label: "Thứ 5", value: "4" }, { label: "Thứ 6", value: "5" }, { label: "Thứ 7", value: "6" }, { label: "Chủ nhật", value: "7" }];

export function StaffScheduleExtras({ active, barbers, onChanged }: { active: boolean; barbers: Barber[]; onChanged: () => void }) {
  const weekly = useAdminList<WeeklyShift[]>("/admin/weekly-shifts", active);
  const [expanded, setExpanded] = useState(false);
  const [barberId, setBarberId] = useState("");
  const [weekday, setWeekday] = useState("1");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("18:00");
  const [from, setFrom] = useState(shopDate(31));
  const [to, setTo] = useState(shopDate(90));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function call(path: string, method: string, body?: unknown) {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try { await api(path, { method, body }); await weekly.reload(); onChanged(); setMessage("Đã cập nhật lịch nhân sự."); }
    catch (err: any) { setError(err.message || "Không cập nhật được."); }
    finally { setBusy(false); }
  }
  const options = barbers.filter((item) => item.active).sort((a, b) => a.name.localeCompare(b.name, "vi")).map((item) => ({ label: item.name, value: item.id }));
  return <View style={{ gap: 13 }}>
    <Pressable accessibilityRole="button" onPress={() => setExpanded((value) => !value)} style={[styles.card, { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}>
      <View><Text style={styles.subtitle}>Mẫu ca lặp</Text><Text style={styles.muted}>{weekly.data?.length || 0} mẫu · dùng cho tự động xếp ca</Text></View>
      <Text style={{ color: colors.gold, fontWeight: "800" }}>{expanded ? "Thu gọn －" : "Mở ＋"}</Text>
    </Pressable>
    {expanded && <>
      <Text style={styles.muted}>Tạo các ca lặp trong khoảng tối đa 90 ngày. Ngày đã có ca chồng lấn sẽ bị từ chối.</Text>
      <Card><ComboBox label="Thợ" value={barberId} onChange={setBarberId} options={options} />
        <Text style={styles.muted}>Thứ trong tuần</Text><Choice value={weekday} onChange={setWeekday} options={weekdays} />
        <DateField label="Từ ngày" value={from} onChange={setFrom} /><DateField label="Đến ngày" value={to} onChange={setTo} />
        <TimeField label="Bắt đầu" value={startTime} onChange={setStartTime} /><TimeField label="Kết thúc" value={endTime} onChange={setEndTime} />
        <Button title="Tạo ca lặp" disabled={busy || !barberId} onPress={() => void call("/admin/weekly-shifts", "POST", { barberId, weekday: Number(weekday), startTime, endTime, from, to })} />
      </Card>
      <DataState loading={weekly.loading} error={weekly.error} retry={() => void weekly.reload()} />
      {weekly.data?.map((item) => <Card key={item.id}><Text style={styles.text}>{barbers.find((barber) => barber.id === item.barberId)?.name} · {weekdays.find((day) => day.value === String(item.weekday))?.label} · {item.startTime}–{item.endTime}</Text><Text style={styles.muted}>{item.from} đến {item.to}</Text><Button title="Xóa ca lặp" secondary disabled={busy} onPress={() => void call(`/admin/weekly-shifts/${item.id}`, "DELETE")} /></Card>)}
    </>}
    <ErrorText message={error} />{!!message && <Text style={{ color: colors.success }}>{message}</Text>}
  </View>;
}
