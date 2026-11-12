import React, { useState } from "react";
import { Text, View } from "react-native";
import { api } from "../api";
import type { Barber, LeaveRequest } from "../types";
import { Button, Card, ComboBox, colors, dateTimeLabel, ErrorText, Field, shopDate, styles } from "../ui";
import { DataState, DateField, FormModal, useAdminList } from "./components";

export function StaffLeaveManagement({ active, barbers, onChanged }: { active: boolean; barbers: Barber[]; onChanged: () => void }) {
  const leaves = useAdminList<LeaveRequest[]>("/admin/leaves", active);
  const [barberId, setBarberId] = useState("");
  const [from, setFrom] = useState(shopDate(1));
  const [to, setTo] = useState(shopDate(1));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState<LeaveRequest | null>(null);
  const options = barbers.filter((item) => item.active).sort((a, b) => a.name.localeCompare(b.name, "vi")).map((item) => ({ label: item.name, value: item.id }));

  async function update(path: string, method: string, body?: unknown) {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await api(path, { method, body });
      await leaves.reload();
      onChanged();
      setMessage("Đã cập nhật đơn nghỉ phép.");
    } catch (err: any) { setError(err.message || "Không cập nhật được đơn nghỉ."); }
    finally { setBusy(false); }
  }
  function approve(item: LeaveRequest) {
    if (item.leaveAppointments?.length) setConfirming(item);
    else void update(`/admin/leaves/${item.id}`, "PATCH", { status: "approved", confirmCancelAppointments: false });
  }

  return <View style={{ gap: 12 }}>
    <Text style={styles.subtitle}>Nghỉ phép</Text>
    <Text style={styles.muted}>Quản lý đơn nghỉ của thợ. Đơn được duyệt sẽ khóa lịch đặt trong khoảng ngày đã chọn.</Text>
    <Card>
      <ComboBox label="Thợ xin nghỉ" value={barberId} onChange={setBarberId} options={options} disabled={!options.length} />
      <DateField label="Từ ngày" value={from} onChange={setFrom} />
      <DateField label="Đến ngày" value={to} onChange={setTo} />
      <Field label="Lý do" value={reason} onChange={setReason} />
      <Button title={busy ? "Đang gửi..." : "Tạo đơn nghỉ"} disabled={busy || !barberId || from > to || reason.trim().length < 2} onPress={() => void update("/admin/leaves", "POST", { barberId, from, to, reason: reason.trim() })} />
    </Card>
    {!!error && <ErrorText message={error} />}
    {!!message && <Text style={{ color: colors.success }}>{message}</Text>}
    <DataState loading={leaves.loading} error={leaves.error} retry={() => void leaves.reload()} empty={leaves.data?.length === 0} />
    {leaves.data?.map((item) => <Card key={item.id}>
      <Text style={styles.text}>{barbers.find((barber) => barber.id === item.barberId)?.name || "Thợ đã ngừng hoạt động"} · {item.from} → {item.to}</Text>
      <Text style={styles.muted}>{item.reason} · {item.status === "pending" ? "Chờ duyệt" : item.status === "approved" ? "Đã duyệt" : "Từ chối"}</Text>
      <Text style={styles.muted}>Ca làm trong khoảng nghỉ · {item.leaveShifts?.length || 0}</Text>
      {item.leaveShifts?.map((shift) => <Text key={shift.id} style={styles.muted}>{shift.date} · {shift.startTime}–{shift.endTime}</Text>)}
      <Text style={{ color: item.leaveAppointments?.length ? colors.danger : colors.success, fontWeight: "800" }}>
        {item.leaveAppointments?.length ? `Cảnh báo: ${item.leaveAppointments.length} lịch khách sẽ bị hủy nếu duyệt.` : "Không có lịch khách bị ảnh hưởng."}
      </Text>
      {item.leaveAppointments?.map((appointment) => <Text key={appointment.id} style={styles.muted}>
        {dateTimeLabel(appointment.startAt)} · {appointment.customerNameSnapshot} · {appointment.serviceNameSnapshot}
      </Text>)}
      {item.status === "pending" && <View style={styles.row}>
        <Button title="Duyệt nghỉ" disabled={busy} onPress={() => approve(item)} />
        <Button title="Từ chối" secondary disabled={busy} onPress={() => void update(`/admin/leaves/${item.id}`, "PATCH", { status: "rejected" })} />
      </View>}
    </Card>)}
    <FormModal title="Xác nhận duyệt đơn nghỉ" visible={!!confirming} onClose={() => { if (!busy) setConfirming(null); }}>
      <Text style={styles.text}>Duyệt đơn sẽ gỡ {confirming?.leaveShifts?.length || 0} ca và hủy {confirming?.leaveAppointments?.length || 0} lịch khách.</Text>
      <Text style={{ color: colors.danger, fontWeight: "800" }}>Chỉ khách bị ảnh hưởng mới nhận lời xin lỗi riêng từ admin.</Text>
      {confirming?.leaveAppointments?.map((appointment) => <Card key={appointment.id} style={{ padding: 11 }}>
        <Text style={styles.text}>{appointment.customerNameSnapshot} · {appointment.serviceNameSnapshot}</Text>
        <Text style={styles.muted}>{dateTimeLabel(appointment.startAt)}</Text>
      </Card>)}
      <View style={styles.row}>
        <Button title={busy ? "Đang xử lý..." : "Hủy lịch khách và duyệt nghỉ"} disabled={busy} onPress={() => { const item = confirming; setConfirming(null); if (item) void update(`/admin/leaves/${item.id}`, "PATCH", { status: "approved", confirmCancelAppointments: true }); }} />
        <Button title="Quay lại" secondary disabled={busy} onPress={() => setConfirming(null)} />
      </View>
    </FormModal>
  </View>;
}
