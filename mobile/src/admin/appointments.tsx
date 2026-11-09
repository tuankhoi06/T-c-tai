import React, { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api } from "../api";
import type { Appointment, AppointmentStatus, Barber } from "../types";
import { Button, Card, colors, dateTimeLabel, ErrorText, Field, money, shopDate, statusLabel, styles, timeLabel } from "../ui";
import { Choice, DangerConfirm, DataState, DateField, FormModal, useAdminList } from "./components";
import { AppointmentForm } from "./appointment_form";
import { AdminTimeline } from "./timeline";

export type AppointmentFilter = { date?: string; from?: string; to?: string; barberId?: string; status?: AppointmentStatus; q?: string };
export function AppointmentsAdmin({ active, barbers, preset, onChanged }: { active: boolean; barbers: Barber[]; preset: { id: number; filter: AppointmentFilter }; onChanged: () => void }) {
  const [date, setDate] = useState(shopDate());
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [barberId, setBarberId] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState("");
  const [detail, setDetail] = useState<Appointment | null>(null);
  const [detailError, setDetailError] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");
  const [action, setAction] = useState<"cancelled" | "completed" | "no_show" | null>(null);
  const [reason, setReason] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "transfer" | "card">("cash");
  const [amountPaid, setAmountPaid] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  useEffect(() => {
    if (!preset.id) return;
    setDate(preset.filter.date || shopDate());
    setFrom(preset.filter.from || "");
    setTo(preset.filter.to || "");
    setBarberId(preset.filter.barberId || "");
    setStatus(preset.filter.status || "");
    setSearch(preset.filter.q || "");
    setShowFilters(Boolean(preset.filter.from || preset.filter.to || preset.filter.barberId || preset.filter.status));
  }, [preset.id]);
  const path = useMemo(() => {
    const p = new URLSearchParams();
    if (date) p.set("date", date);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (barberId) p.set("barberId", barberId);
    if (status) p.set("status", status);
    if (search.trim()) p.set("q", search.trim());
    return `/admin/appointments?${p}`;
  }, [date, from, to, barberId, status, search]);
  const list = useAdminList<Appointment[]>(path, active);
  const filterCount = Number(Boolean(from || to)) + Number(Boolean(barberId)) + Number(Boolean(status));
  async function loadDetail(id: string) {
    setDetailError("");
    try { setDetail(await api<Appointment>(`/appointments/${id}`)); }
    catch (err: any) { setDetailError(err.message || "Không tải được lịch hẹn."); }
  }
  async function changeStatus(next: AppointmentStatus, cancelReason?: string) {
    if (!detailId || busy) return;
    setBusy(true); setDetailError(""); setSuccess("");
    try {
      const updated = await api<Appointment>(`/admin/appointments/${detailId}/status`, { method: "PATCH", body: { status: next, ...(cancelReason ? { cancelReason } : {}), ...(next === "completed" ? { payment: { method: paymentMethod, amount: Number(amountPaid) } } : {}) } });
      setDetail(updated); setAction(null); setReason("");
      setSuccess(`Đã cập nhật lịch sang ${statusLabel[next]}.`);
      await list.reload(); onChanged();
    } catch (err: any) { setDetailError(err.message || "Không cập nhật được lịch hẹn."); }
    finally { setBusy(false); }
  }
  const selected = detail || list.data?.find((item) => item.id === detailId) || null;
  function showDetail(item: Appointment) { setDetailId(item.id); setDetail(item); setSuccess(""); void loadDetail(item.id); }
  function openForm(item: Appointment | null) { setDetailId(""); setDetail(null); setEditing(item); setFormOpen(true); }
  return <View style={{ gap: 12 }}>
    <Text style={styles.subtitle}>Lịch hẹn</Text>
    <AdminTimeline active={active} barbers={barbers} onOpen={showDetail} />
    {!!success && !detailId && <Text style={{ color: colors.success }}>{success}</Text>}
    <View style={styles.row}><Button title="＋ Thêm lịch" onPress={() => openForm(null)} /><Button title="Hôm nay" secondary onPress={() => { setDate(shopDate()); setFrom(""); setTo(""); }} /><Pressable onPress={() => setShowFilters((value) => !value)} style={[styles.button, styles.buttonSecondary, { paddingVertical: 12, paddingHorizontal: 15 }]}><Text style={styles.text}>{showFilters ? "Thu bộ lọc" : `Bộ lọc${filterCount ? ` · ${filterCount}` : ""}`}</Text></Pressable><Button title="Làm mới" secondary disabled={list.loading} onPress={() => void list.reload()} /></View>
    {showFilters && <Card style={{ padding: 13, gap: 10 }}>
      <DateField label="Ngày phục vụ" value={date} onChange={(value) => { setDate(value); setFrom(""); setTo(""); }} />
      <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}><View style={{ flex: 1, minWidth: 150 }}><DateField label="Từ ngày" value={from} onChange={(value) => { setFrom(value); setDate(""); }} /></View><View style={{ flex: 1, minWidth: 150 }}><DateField label="Đến ngày" value={to} onChange={(value) => { setTo(value); setDate(""); }} /></View></View>
      <View style={{ gap: 6 }}><Text style={styles.muted}>Thợ</Text><Choice value={barberId} onChange={setBarberId} options={[{ label: "Tất cả", value: "" }, ...barbers.map((b) => ({ label: b.name, value: b.id }))]} /></View>
      <View style={{ gap: 6 }}><Text style={styles.muted}>Trạng thái</Text><Choice value={status} onChange={setStatus} options={[{ label: "Tất cả", value: "" }, ...(["pending", "confirmed", "in_progress", "completed", "cancelled", "no_show"] as AppointmentStatus[]).map((s) => ({ label: statusLabel[s], value: s }))]} /></View>
      <Button title="Xóa bộ lọc nâng cao" secondary onPress={() => { setDate(shopDate()); setFrom(""); setTo(""); setBarberId(""); setStatus(""); setSearch(""); }} />
    </Card>}
    <Field label="Tìm tên khách, số điện thoại hoặc mã lịch" value={search} onChange={setSearch} />
    <DataState loading={list.loading} error={list.error} retry={() => void list.reload()} empty={list.data?.length === 0} />
    {!list.error && list.data?.map((item) => <Card key={item.id}>
      <Text style={styles.subtitle}>{item.customerNameSnapshot} · {statusLabel[item.status]}</Text>
      <Text style={styles.text}>{item.serviceNameSnapshot} · {item.barberNameSnapshot}</Text>
      <Text style={styles.muted}>{dateTimeLabel(item.startAt)} – {timeLabel(item.endAt)} · {money(item.priceSnapshot)}</Text>
      <Text style={styles.muted}>Mã: {item.id}</Text>
      <View style={styles.row}><Button title="Xem chi tiết" secondary onPress={() => showDetail(item)} />{(item.status === "pending" || item.status === "confirmed") && <Button title="Đổi giờ / thợ" secondary onPress={() => openForm(item)} />}</View>
    </Card>)}
    <FormModal visible={!!detailId} title="Chi tiết lịch hẹn" onClose={() => { if (!busy) { setDetailId(""); setDetail(null); } }}>
      <ErrorText message={detailError} />{detailError && <Button title="Thử lại" secondary onPress={() => void loadDetail(detailId)} />}
      {!!success && <Text style={{ color: colors.success }}>{success}</Text>}
      {selected && <>
        <Text style={styles.text}>Mã lịch: {selected.id}</Text>
        <Text style={styles.text}>Khách: {selected.customerNameSnapshot}{selected.customerPhoneSnapshot ? ` · ${selected.customerPhoneSnapshot}` : ""}</Text>
        <Text style={styles.text}>Dịch vụ: {selected.serviceNameSnapshot} · {money(selected.priceSnapshot)}</Text>
        <Text style={styles.text}>Thợ: {selected.barberNameSnapshot}</Text>
        <Text style={styles.text}>Thời gian: {dateTimeLabel(selected.startAt)} – {timeLabel(selected.endAt)}</Text>
        <Text style={styles.text}>Trạng thái: {statusLabel[selected.status]}</Text>
        {selected.walkIn && <Text style={styles.muted}>Khách vãng lai</Text>}
        {!!selected.voucherCode && <Text style={styles.muted}>Mã giảm giá: {selected.voucherCode} · Giảm {money(selected.discountAmount || 0)}</Text>}
        {selected.paymentMethod && <Text style={styles.muted}>Thanh toán: {selected.paymentMethod} · Thực thu {money(selected.amountPaid || 0)}</Text>}
        {!!selected.aiHaircutName && <Card><Text style={styles.text}>Kiểu tóc khách đã gửi: {selected.aiHaircutName}</Text><Text style={styles.muted}>Ghi chú AI cho thợ: {selected.aiBarberNote}</Text></Card>}
        {!!selected.cancelReason && <Text style={styles.muted}>Lý do hủy: {selected.cancelReason}</Text>}
        {(selected.status === "pending" || selected.status === "confirmed") && <Button title="Sửa lịch" secondary disabled={busy} onPress={() => openForm(selected)} />}
        {selected.status === "pending" && <Button title={busy ? "Đang gửi..." : "Xác nhận lịch"} disabled={busy} onPress={() => void changeStatus("confirmed")} />}
        {selected.status === "confirmed" && <Button title="Bắt đầu phục vụ" disabled={busy} onPress={() => void changeStatus("in_progress")} />}
        {(["pending", "confirmed", "in_progress"].includes(selected.status)) && <Button title="Hủy lịch" secondary disabled={busy} onPress={() => setAction("cancelled")} />}
        {(["pending", "confirmed", "in_progress"].includes(selected.status)) && <Button title="Khách không đến" secondary disabled={busy} onPress={() => setAction("no_show")} />}
        {(selected.status === "confirmed" || selected.status === "in_progress") && <Button title="Hoàn thành & ghi nhận thanh toán" disabled={busy} onPress={() => { setAmountPaid(String(selected.priceSnapshot)); setAction("completed"); }} />}
      </>}
    </FormModal>
    <FormModal title={action === "cancelled" ? "Hủy lịch hẹn" : action === "no_show" ? "Khách không đến" : "Hoàn thành & thanh toán"} visible={!!action} onClose={() => { if (!busy) { setAction(null); setReason(""); } }}>
      <ErrorText message={detailError} />
      {action === "cancelled" && <Field label="Lý do hủy (bắt buộc)" value={reason} onChange={setReason} multiline />}
      {action === "completed" && <><Text style={styles.muted}>Phương thức thanh toán</Text><Choice value={paymentMethod} onChange={(value) => setPaymentMethod(value as typeof paymentMethod)} options={[{ label: "Tiền mặt", value: "cash" }, { label: "Chuyển khoản", value: "transfer" }, { label: "Thẻ", value: "card" }]} /><Field label="Số tiền thực thu (VNĐ)" value={amountPaid} onChange={setAmountPaid} numeric /></>}
      {action === "no_show" && <Text style={styles.muted}>Xác nhận khách không đến sau giờ hẹn?</Text>}
      <Button title={busy ? "Đang xử lý..." : "Xác nhận"} disabled={busy || (action === "cancelled" && reason.trim().length < 3) || (action === "completed" && (!Number.isFinite(Number(amountPaid)) || Number(amountPaid) < 0))} onPress={() => void changeStatus(action!, reason)} />
    </FormModal>
    <AppointmentForm visible={formOpen} item={editing} onClose={() => setFormOpen(false)} onSaved={(appointment) => { setSuccess(editing ? "Đã sửa lịch hẹn." : "Đã thêm lịch hẹn."); setDetail(appointment); void list.reload(); onChanged(); }} />
  </View>;
}
