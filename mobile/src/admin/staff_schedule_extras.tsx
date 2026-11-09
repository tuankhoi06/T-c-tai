import React, { useState } from "react";
import { Text, View } from "react-native";
import { api } from "../api";
import type { Barber, LeaveRequest, WeeklyShift } from "../types";
import { Button, Card, colors, ErrorText, Field, shopDate, styles } from "../ui";
import { Choice, DataState, DateField, TimeField, useAdminList } from "./components";

const weekdays = [{ label: "Thứ 2", value: "1" }, { label: "Thứ 3", value: "2" }, { label: "Thứ 4", value: "3" }, { label: "Thứ 5", value: "4" }, { label: "Thứ 6", value: "5" }, { label: "Thứ 7", value: "6" }, { label: "Chủ nhật", value: "7" }];

export function StaffScheduleExtras({ active, barbers, onChanged }: { active: boolean; barbers: Barber[]; onChanged: () => void }) {
  const weekly = useAdminList<WeeklyShift[]>("/admin/weekly-shifts", active);
  const leaves = useAdminList<LeaveRequest[]>("/admin/leaves", active);
  const [barberId, setBarberId] = useState("");
  const [weekday, setWeekday] = useState("1");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("18:00");
  const [from, setFrom] = useState(shopDate(31));
  const [to, setTo] = useState(shopDate(90));
  const [leaveBarberId, setLeaveBarberId] = useState("");
  const [leaveFrom, setLeaveFrom] = useState(shopDate(1));
  const [leaveTo, setLeaveTo] = useState(shopDate(1));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function call(path: string, method: string, body?: unknown) {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try { await api(path, { method, body }); await Promise.all([weekly.reload(), leaves.reload()]); onChanged(); setMessage("Đã cập nhật lịch nhân sự."); }
    catch (err: any) { setError(err.message || "Không cập nhật được."); }
    finally { setBusy(false); }
  }
  const options = barbers.filter((item) => item.active).map((item) => ({ label: item.name, value: item.id }));
  return <View style={{ gap: 13 }}>
    <Text style={styles.subtitle}>Ca cố định theo tuần</Text>
    <Text style={styles.muted}>Tạo các ca lặp trong khoảng tối đa 90 ngày. Ngày đã có ca chồng lấn sẽ bị từ chối.</Text>
    <Card><Text style={styles.muted}>Thợ</Text><Choice value={barberId} onChange={setBarberId} options={options} />
      <Text style={styles.muted}>Thứ trong tuần</Text><Choice value={weekday} onChange={setWeekday} options={weekdays} />
      <DateField label="Từ ngày" value={from} onChange={setFrom} /><DateField label="Đến ngày" value={to} onChange={setTo} />
      <TimeField label="Bắt đầu" value={startTime} onChange={setStartTime} /><TimeField label="Kết thúc" value={endTime} onChange={setEndTime} />
      <Button title="Tạo ca lặp" disabled={busy || !barberId} onPress={() => void call("/admin/weekly-shifts", "POST", { barberId, weekday: Number(weekday), startTime, endTime, from, to })} />
    </Card>
    <DataState loading={weekly.loading} error={weekly.error} retry={() => void weekly.reload()} />
    {weekly.data?.map((item) => <Card key={item.id}><Text style={styles.text}>{barbers.find((barber) => barber.id === item.barberId)?.name} · {weekdays.find((day) => day.value === String(item.weekday))?.label} · {item.startTime}–{item.endTime}</Text><Text style={styles.muted}>{item.from} đến {item.to}</Text><Button title="Xóa ca lặp" secondary disabled={busy} onPress={() => void call(`/admin/weekly-shifts/${item.id}`, "DELETE")} /></Card>)}
    <Text style={styles.subtitle}>Nghỉ phép</Text>
    <Card><Text style={styles.muted}>Thợ xin nghỉ</Text><Choice value={leaveBarberId} onChange={setLeaveBarberId} options={options} />
      <DateField label="Từ ngày" value={leaveFrom} onChange={setLeaveFrom} /><DateField label="Đến ngày" value={leaveTo} onChange={setLeaveTo} /><Field label="Lý do" value={reason} onChange={setReason} />
      <Button title="Tạo đơn nghỉ" disabled={busy || !leaveBarberId || reason.trim().length < 2} onPress={() => void call("/admin/leaves", "POST", { barberId: leaveBarberId, from: leaveFrom, to: leaveTo, reason: reason.trim() })} />
    </Card>
    <DataState loading={leaves.loading} error={leaves.error} retry={() => void leaves.reload()} />
    {leaves.data?.map((item) => <Card key={item.id}><Text style={styles.text}>{barbers.find((barber) => barber.id === item.barberId)?.name} · {item.from} → {item.to}</Text><Text style={styles.muted}>{item.reason} · {item.status === "pending" ? "Chờ duyệt" : item.status === "approved" ? "Đã duyệt" : "Từ chối"}</Text>{item.status === "pending" && <View style={styles.row}><Button title="Duyệt nghỉ" disabled={busy} onPress={() => void call(`/admin/leaves/${item.id}`, "PATCH", { status: "approved" })} /><Button title="Từ chối" secondary disabled={busy} onPress={() => void call(`/admin/leaves/${item.id}`, "PATCH", { status: "rejected" })} /></View>}</Card>)}
    <ErrorText message={error} />{!!message && <Text style={{ color: colors.success }}>{message}</Text>}
  </View>;
}
