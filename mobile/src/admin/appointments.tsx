import React, { useEffect, useMemo, useState } from "react";
import { Pressable, Switch, Text, View, useWindowDimensions } from "react-native";
import { api } from "../api";
import type { Appointment, AppointmentStatus, Barber } from "../types";
import { Button, Card, ComboBox, colors, dateTimeLabel, DragScrollView, ErrorText, Field, money, shopDate, statusLabel, styles, timeLabel } from "../ui";
import { Choice, DangerConfirm, DataState, FormModal, useAdminList } from "./components";
import { AppointmentForm } from "./appointment_form";
import { QuickContactModal } from "../QuickContactModal";

export type AppointmentFilter = { date?: string; from?: string; to?: string; barberId?: string; status?: AppointmentStatus; q?: string };
function shiftDate(value: string, offset: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
function mondayOf(value: string) {
  const day = new Date(`${value}T12:00:00Z`).getUTCDay();
  return shiftDate(value, -((day + 6) % 7));
}
function weekdayLabel(value: string) {
  const label = new Intl.DateTimeFormat("vi-VN", { timeZone: "UTC", weekday: "long" }).format(new Date(`${value}T12:00:00Z`));
  return label.charAt(0).toLocaleUpperCase("vi-VN") + label.slice(1);
}
function shiftMonth(value: string, amount: number) {
  const date = new Date(`${value.slice(0, 7)}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 10);
}
export function AppointmentsAdmin({ active, barbers, preset, onChanged }: { active: boolean; barbers: Barber[]; preset: { id: number; filter: AppointmentFilter }; onChanged: () => void }) {
  const { width: viewportWidth } = useWindowDimensions();
  const wideLayout = viewportWidth >= 920;
  const [weekStart, setWeekStart] = useState(mondayOf(shopDate()));
  const [selectedDate, setSelectedDate] = useState(shopDate());
  const [monthStart, setMonthStart] = useState(`${shopDate().slice(0, 7)}-01`);
  const [barberId, setBarberId] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState("");
  const [detail, setDetail] = useState<Appointment | null>(null);
  const [detailError, setDetailError] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");
  const [action, setAction] = useState<"cancelled" | "completed" | "no_show" | "payment" | null>(null);
  const [reason, setReason] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "transfer" | "card">("cash");
  const [amountPaid, setAmountPaid] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [contactAppointment, setContactAppointment] = useState<Appointment | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [autoCancelUnconfirmed, setAutoCancelUnconfirmed] = useState(true);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  useEffect(() => {
    if (!active) return;
    let mounted = true;
    void api<{ autoCancelUnconfirmed: boolean }>("/admin/settings").then((settings) => {
      if (mounted) setAutoCancelUnconfirmed(settings.autoCancelUnconfirmed);
    }).catch((error: any) => {
      if (mounted) setSettingsError(error.message || "Không tải được cài đặt lịch hẹn.");
    });
    return () => { mounted = false; };
  }, [active]);
  async function saveAutoCancelSetting(value: boolean) {
    if (settingsBusy) return;
    setSettingsBusy(true); setSettingsError("");
    try {
      const settings = await api<{ autoCancelUnconfirmed: boolean }>("/admin/settings", { method: "PATCH", body: { autoCancelUnconfirmed: value } });
      setAutoCancelUnconfirmed(settings.autoCancelUnconfirmed);
    } catch (error: any) {
      setSettingsError(error.message || "Không lưu được cài đặt.");
    } finally { setSettingsBusy(false); }
  }
  useEffect(() => {
    if (!preset.id) return;
    const targetDate = preset.filter.date || preset.filter.from || shopDate();
    const start = mondayOf(targetDate);
    setSelectedDate(targetDate);
    setWeekStart(start);
    setMonthStart(`${targetDate.slice(0, 7)}-01`);
    setBarberId(preset.filter.barberId || "");
    setStatus(preset.filter.status || "");
    setSearch(preset.filter.q || "");
    setShowFilters(Boolean(preset.filter.from || preset.filter.to || preset.filter.barberId || preset.filter.status));
  }, [preset.id]);
  const weekEnd = shiftDate(weekStart, 6);
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, index) => shiftDate(weekStart, index)), [weekStart]);
  const monthDates = useMemo(() => {
    const firstWeek = mondayOf(monthStart);
    return Array.from({ length: 42 }, (_, index) => shiftDate(firstWeek, index));
  }, [monthStart]);
  const path = useMemo(() => {
    const p = new URLSearchParams({ from: monthDates[0], to: monthDates[41] });
    if (barberId) p.set("barberId", barberId);
    if (status) p.set("status", status);
    if (search.trim()) p.set("q", search.trim());
    return `/admin/appointments?${p}`;
  }, [monthDates, barberId, status, search]);
  const list = useAdminList<Appointment[]>(path, active);
  const visibleAppointments = [...(list.data || [])]
    .filter((item) => item.startAt.slice(0, 10) >= weekStart && item.startAt.slice(0, 10) <= weekEnd)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const filterCount = Number(Boolean(barberId)) + Number(Boolean(status)) + Number(Boolean(search.trim()));
  function selectWeek(start: string) {
    setWeekStart(start); setSelectedDate(start);
    if (start.slice(0, 7) !== monthStart.slice(0, 7)) setMonthStart(`${start.slice(0, 7)}-01`);
  }
  async function loadDetail(id: string) {
    setDetailError("");
    try { setDetail(await api<Appointment>(`/appointments/${id}`)); }
    catch (err: any) { setDetailError(err.message || "Không tải được lịch hẹn."); }
  }
  async function changeStatus(next: AppointmentStatus, cancelReason?: string) {
    if (!detailId || busy) return;
    setBusy(true); setDetailError(""); setSuccess("");
    try {
      const updated = await api<Appointment>(`/admin/appointments/${detailId}/status`, { method: "PATCH", body: { status: next, ...(cancelReason ? { cancelReason } : {}) } });
      setDetail(updated); setAction(null); setReason("");
      setSuccess(`Đã cập nhật lịch sang ${statusLabel[next]}.`);
      await list.reload(); onChanged();
    } catch (err: any) { setDetailError(err.message || "Không cập nhật được lịch hẹn."); }
    finally { setBusy(false); }
  }
  async function confirmPayment() {
    if (!detailId || busy) return;
    setBusy(true); setDetailError(""); setSuccess("");
    try {
      const updated = await api<Appointment>(`/admin/appointments/${detailId}/confirm-payment`, { method: "POST", body: { payment: { method: paymentMethod, amount: Number(amountPaid) } } });
      setDetail(updated); setAction(null); setSuccess("Đã xác nhận thu tiền; doanh thu và hoa hồng đã được ghi nhận.");
      await list.reload(); onChanged();
    } catch (err: any) { setDetailError(err.message || "Không xác nhận được khoản thu."); }
    finally { setBusy(false); }
  }
  const selected = detail || list.data?.find((item) => item.id === detailId) || null;
  function showDetail(item: Appointment) { setDetailId(item.id); setDetail(item); setSuccess(""); void loadDetail(item.id); }
  function openForm(item: Appointment | null) { setDetailId(""); setDetail(null); setEditing(item); setFormOpen(true); }
  function canMessageCustomer(customerId: string) { return !customerId.startsWith("walkin-") && !customerId.startsWith("demo-walkin-") && customerId !== "deleted"; }
  function contactCustomer(item: Appointment) { setDetailId(""); setDetail(null); setContactAppointment(item); }
  return <View style={{ gap: 12 }}>
    <Text style={styles.subtitle}>Lịch hẹn theo tuần</Text>
    <Text style={styles.muted}>Chọn ngày trên lịch tháng hoặc chuyển tuần; chạm lịch để xem và xử lý.</Text>
    <Card style={{ padding: 12, gap: 5 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[styles.text, { fontWeight: "700" }]}>Tự hủy lịch chưa xác nhận</Text>
          <Text style={styles.muted}>Tự hủy khi đã qua giờ kết thúc lịch mà admin chưa xác nhận.</Text>
        </View>
        <Switch accessibilityLabel="Tự hủy lịch chưa xác nhận" value={autoCancelUnconfirmed} disabled={settingsBusy} onValueChange={(value) => void saveAutoCancelSetting(value)} trackColor={{ false: colors.border, true: colors.gold }} thumbColor={autoCancelUnconfirmed ? colors.cream : colors.muted} />
      </View>
      {!!settingsError && <ErrorText message={settingsError} />}
    </Card>
    {!!success && !detailId && <Text style={{ color: colors.success }}>{success}</Text>}
    <View style={{ flexDirection: wideLayout ? "row" : "column", alignItems: "flex-start", gap: 14 }}>
      <View style={{ width: wideLayout ? 270 : "100%", gap: 12, flexShrink: 0 }}>
        <ComboBox label="Lọc theo thợ" value={barberId} onChange={setBarberId} options={[{ label: "Tất cả thợ", value: "" }, ...[...barbers].sort((a, b) => a.name.localeCompare(b.name, "vi")).map((b) => ({ label: b.name, value: b.id }))]} searchable searchPlaceholder="Tìm tên thợ" />
        <View style={{ gap: 8 }}>
          <Button title="＋ Thêm lịch" onPress={() => openForm(null)} />
          <View style={styles.row}>
            <View style={{ flex: 1 }}><Button title="Làm mới" secondary disabled={list.loading} onPress={() => void list.reload()} /></View>
            <View style={{ flex: 1 }}><Pressable onPress={() => setShowFilters((value) => !value)} style={[styles.button, styles.buttonSecondary, { paddingHorizontal: 8 }]}><Text style={[styles.text, { textAlign: "center" }]}>{showFilters ? "Ẩn lọc" : `Bộ lọc${filterCount ? ` · ${filterCount}` : ""}`}</Text></Pressable></View>
          </View>
        </View>
        {showFilters && <Card style={{ padding: 12, gap: 10 }}>
          <Field label="Tìm khách hoặc mã lịch" value={search} onChange={setSearch} />
          <ComboBox label="Trạng thái" value={status} onChange={setStatus} options={[{ label: "Tất cả trạng thái", value: "" }, ...(["pending", "confirmed", "in_progress", "completed", "cancelled", "no_show"] as AppointmentStatus[]).map((s) => ({ label: statusLabel[s], value: s }))]} />
          <Button title="Xóa bộ lọc" secondary onPress={() => { setBarberId(""); setStatus(""); setSearch(""); }} />
        </Card>}
        <Card style={{ width: "100%", padding: 12, gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={[styles.text, { fontWeight: "800" }]}>Tháng {monthStart.slice(5, 7)}-{monthStart.slice(0, 4)}</Text>
            <View style={{ flexDirection: "row", gap: 6 }}>
              <Pressable accessibilityRole="button" accessibilityLabel="Tháng trước" onPress={() => setMonthStart((value) => shiftMonth(value, -1))} style={{ width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.input }}><Text style={{ color: colors.gold, fontSize: 22 }}>‹</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Tháng sau" onPress={() => setMonthStart((value) => shiftMonth(value, 1))} style={{ width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.input }}><Text style={{ color: colors.gold, fontSize: 22 }}>›</Text></Pressable>
            </View>
          </View>
          <View style={{ flexDirection: "row" }}>{["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((label) => <Text key={label} style={[styles.muted, { width: "14.285%", textAlign: "center", fontSize: 11 }]}>{label}</Text>)}</View>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {monthDates.map((day) => {
              const inMonth = day.slice(0, 7) === monthStart.slice(0, 7);
              const isSelected = day === selectedDate;
              const hasAppointments = (list.data || []).some((item) => item.startAt.slice(0, 10) === day);
              return <Pressable key={day} accessibilityRole="button" accessibilityLabel={day} onPress={() => { setSelectedDate(day); setWeekStart(mondayOf(day)); if (!inMonth) setMonthStart(`${day.slice(0, 7)}-01`); }} style={{ width: "14.285%", height: 40, alignItems: "center", justifyContent: "center" }}>
                <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: isSelected ? colors.gold : day === shopDate() ? colors.card : "transparent", borderWidth: day === shopDate() && !isSelected ? 1 : 0, borderColor: colors.gold }}><Text style={{ color: isSelected ? colors.dark : inMonth ? colors.text : colors.muted, fontSize: 12, fontWeight: isSelected || day === shopDate() ? "800" : "500" }}>{Number(day.slice(8, 10))}</Text></View>
                {hasAppointments && <View style={{ position: "absolute", bottom: 0, width: 4, height: 4, borderRadius: 2, backgroundColor: isSelected ? colors.gold : colors.danger }} />}
              </Pressable>;
            })}
          </View>
          <Text style={styles.muted}>● Có lịch hẹn · Chọn ngày để mở tuần tương ứng</Text>
        </Card>
      </View>
      <View style={{ flex: 1, width: wideLayout ? undefined : "100%", minWidth: 0, gap: 12 }}>
        <View style={[styles.row, { alignItems: "center", justifyContent: "space-between" }]}>
          <View style={[styles.row, { alignItems: "center", gap: 6 }]}>
            <Pressable accessibilityRole="button" accessibilityLabel="Tuần trước" onPress={() => selectWeek(shiftDate(weekStart, -7))} style={{ width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}><Text style={{ color: colors.text, fontSize: 23 }}>‹</Text></Pressable>
            <Button title="Tuần này" secondary onPress={() => { const today = shopDate(); selectWeek(mondayOf(today)); setSelectedDate(today); setMonthStart(`${today.slice(0, 7)}-01`); }} />
            <Pressable accessibilityRole="button" accessibilityLabel="Tuần sau" onPress={() => selectWeek(shiftDate(weekStart, 7))} style={{ width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}><Text style={{ color: colors.text, fontSize: 23 }}>›</Text></Pressable>
          </View>
          {wideLayout && <Text style={styles.muted}>{weekStart} — {weekEnd} · {visibleAppointments.length} lịch</Text>}
        </View>
        {!wideLayout && <Text style={styles.muted}>{weekStart} — {weekEnd} · {visibleAppointments.length} lịch</Text>}
        <DataState loading={list.loading} error={list.error} retry={() => void list.reload()} empty={list.data != null && visibleAppointments.length === 0} />
        {!list.error && <DragScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 9, paddingBottom: 8 }}>
          {weekDates.map((day) => {
            const dayAppointments = visibleAppointments.filter((item) => item.startAt.slice(0, 10) === day);
            const isToday = day === shopDate();
            return <View key={day} style={{ width: 218, minHeight: 370, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: selectedDate === day ? colors.gold : colors.border, padding: 10, gap: 8 }}>
              <Pressable onPress={() => setSelectedDate(day)} style={{ paddingBottom: 8, borderBottomWidth: 1, borderColor: colors.border }}><Text style={{ color: isToday ? colors.gold : colors.text, fontSize: 15, fontWeight: "800" }}>{weekdayLabel(day)}{isToday ? " · Hôm nay" : ""}</Text><Text style={styles.muted}>{day} · {dayAppointments.length} lịch</Text></Pressable>
              {!dayAppointments.length && <Text style={[styles.muted, { paddingVertical: 8 }]}>Chưa có lịch hẹn</Text>}
              {dayAppointments.map((item) => <Pressable key={item.id} onPress={() => showDetail(item)} style={{ backgroundColor: colors.input, borderLeftWidth: 3, borderLeftColor: item.status === "cancelled" || item.status === "no_show" ? colors.danger : colors.gold, borderRadius: 9, padding: 9, gap: 3 }}>
                <Text style={[styles.text, { fontWeight: "700", fontSize: 13 }]} numberOfLines={1}>{timeLabel(item.startAt)} · {item.customerNameSnapshot}</Text>
                <Text style={{ color: colors.gold, fontSize: 12, fontWeight: "700" }} numberOfLines={1}>{item.serviceNameSnapshot}</Text>
                <Text style={[styles.muted, { fontSize: 11 }]} numberOfLines={1}>{item.barberNameSnapshot} · {statusLabel[item.status]}</Text>
                {item.status === "completed" && !item.paymentConfirmedAt && !(item.amountPaid != null && item.paymentMethod) && <Text style={{ color: colors.danger, fontSize: 11, fontWeight: "700" }}>Chờ xác nhận thu tiền</Text>}
              </Pressable>)}
            </View>;
          })}
        </DragScrollView>}
        <Text style={styles.muted}>Chạm một lịch hẹn để xem chi tiết, đổi trạng thái, liên hệ khách hoặc xác nhận thanh toán.</Text>
      </View>
    </View>
    <FormModal visible={!!detailId} title="Chi tiết lịch hẹn" onClose={() => { if (!busy) { setDetailId(""); setDetail(null); } }}>
      <ErrorText message={detailError} />{detailError && <Button title="Thử lại" secondary onPress={() => void loadDetail(detailId)} />}
      {!!success && <Text style={{ color: colors.success }}>{success}</Text>}
      {selected && <>
        <Text style={styles.text}>Mã lịch: {selected.id}</Text>
        <Text style={styles.text}>Khách: {selected.customerNameSnapshot}{selected.customerPhoneSnapshot ? ` · ${selected.customerPhoneSnapshot}` : ""}</Text>
        {canMessageCustomer(selected.customerId) && <View style={styles.row}><Button title="Nhắn khách" secondary onPress={() => contactCustomer(selected)} /></View>}
        <Text style={styles.text}>Dịch vụ: {selected.serviceNameSnapshot} · {money(selected.priceSnapshot)}</Text>
        <Text style={styles.text}>Thợ: {selected.barberNameSnapshot}</Text>
        <Text style={styles.text}>Thời gian: {dateTimeLabel(selected.startAt)} – {timeLabel(selected.endAt)}</Text>
        <Text style={styles.text}>Trạng thái: {statusLabel[selected.status]}</Text>
        {selected.walkIn && <Text style={styles.muted}>Đặt trực tiếp tại tiệm</Text>}
        {!!selected.voucherCode && <Text style={styles.muted}>Mã giảm giá: {selected.voucherCode} · Giảm {money(selected.discountAmount || 0)}</Text>}
        {selected.paymentMethod && <Text style={styles.muted}>Thanh toán: {selected.paymentMethod} · Thực thu {money(selected.amountPaid || 0)}</Text>}
        {selected.paymentConfirmedAt && <Text style={{ color: colors.success, fontWeight: "700" }}>Đã xác nhận thu tiền · {dateTimeLabel(selected.paymentConfirmedAt)}</Text>}
        {selected.paymentConfirmedAt && <Text style={styles.muted}>Hoa hồng thợ: {money(selected.commissionAmount || 0)}</Text>}
        {!!selected.aiHaircutName && <Card><Text style={styles.text}>Kiểu tóc khách đã gửi: {selected.aiHaircutName}</Text><Text style={styles.muted}>Ghi chú AI cho thợ: {selected.aiBarberNote}</Text></Card>}
        {!!selected.cancelReason && <Text style={styles.muted}>Lý do hủy: {selected.cancelReason}</Text>}
        {(selected.status === "pending" || selected.status === "confirmed") && <Button title="Sửa lịch" secondary disabled={busy} onPress={() => openForm(selected)} />}
        {selected.status === "pending" && <Button title={busy ? "Đang gửi..." : "Xác nhận lịch"} disabled={busy} onPress={() => void changeStatus("confirmed")} />}
        {(["pending", "confirmed", "in_progress"].includes(selected.status)) && <Button title="Hủy lịch" secondary disabled={busy} onPress={() => setAction("cancelled")} />}
        {(["pending", "confirmed", "in_progress"].includes(selected.status)) && <Button title="Khách không đến" secondary disabled={busy} onPress={() => setAction("no_show")} />}
        {(selected.status === "confirmed" || selected.status === "in_progress") && <Button title="Hoàn thành dịch vụ" disabled={busy} onPress={() => setAction("completed")} />}
        {selected.status === "completed" && !selected.paymentConfirmedAt && !(selected.amountPaid != null && selected.paymentMethod) && <Button title="Xác nhận đã thu tiền" disabled={busy} onPress={() => { setAmountPaid(String(Math.max(0, selected.priceSnapshot - (selected.simulatedPaid || 0)))); setAction("payment"); }} />}
      </>}
    </FormModal>
    <FormModal title={action === "cancelled" ? "Hủy lịch hẹn" : action === "no_show" ? "Khách không đến" : action === "payment" ? "Xác nhận đã thu tiền" : "Hoàn thành dịch vụ"} visible={!!action} onClose={() => { if (!busy) { setAction(null); setReason(""); } }}>
      <ErrorText message={detailError} />
      {action === "cancelled" && <Field label="Lý do hủy (bắt buộc)" value={reason} onChange={setReason} multiline />}
      {action === "completed" && <Text style={styles.muted}>Ca sẽ được đánh dấu hoàn thành. Doanh thu và hoa hồng chưa được tính cho đến khi Admin xác nhận đã thu tiền.</Text>}
      {action === "payment" && <><Text style={styles.muted}>Ghi nhận số tiền khách thanh toán tại tiệm. Chỉ sau khi xác nhận, khoản thu mới vào báo cáo và hoa hồng thợ.</Text>{!!selected?.simulatedPaid && <Text style={styles.muted}>Đã thanh toán trước: {money(selected.simulatedPaid)} · Số còn lại tối đa: {money(Math.max(0, (selected.priceSnapshot || 0) - selected.simulatedPaid))}</Text>}<Choice value={paymentMethod} onChange={(value) => setPaymentMethod(value as typeof paymentMethod)} options={[{ label: "Tiền mặt", value: "cash" }, { label: "Chuyển khoản", value: "transfer" }, { label: "Thẻ", value: "card" }]} /><Field label="Số tiền thu tại tiệm (VNĐ)" value={amountPaid} onChange={setAmountPaid} numeric />{selected && <Text style={{ color: colors.success, fontWeight: "700" }}>Hoa hồng dự kiến cho {selected.barberNameSnapshot}: {money(Math.round((Number(amountPaid || 0) + (selected.simulatedPaid || 0)) * (barbers.find((item) => item.id === selected.barberId)?.commissionRate || 0) / 100))}</Text>}</>}
      {action === "no_show" && <Text style={styles.muted}>Xác nhận khách không đến sau giờ hẹn?</Text>}
      <Button title={busy ? "Đang xử lý..." : action === "payment" ? "Xác nhận đã thu tiền" : action === "completed" ? "Xác nhận hoàn thành" : "Xác nhận"} disabled={busy || (action === "cancelled" && reason.trim().length < 3) || (action === "payment" && (!Number.isFinite(Number(amountPaid)) || Number(amountPaid) < 0))} onPress={() => { if (action === "payment") void confirmPayment(); else if (action) void changeStatus(action, reason); }} />
    </FormModal>
    <AppointmentForm visible={formOpen} item={editing} onClose={() => setFormOpen(false)} onSaved={(appointment) => { setSuccess(editing ? "Đã sửa lịch hẹn." : "Đã thêm lịch hẹn."); setDetail(appointment); void list.reload(); onChanged(); }} />
    <QuickContactModal visible={!!contactAppointment} customerId={contactAppointment?.customerId && canMessageCustomer(contactAppointment.customerId) ? contactAppointment.customerId : undefined}
      customerName={contactAppointment?.customerNameSnapshot || "Khách hàng"} appointmentId={contactAppointment?.id}
      onClose={() => setContactAppointment(null)} onSent={() => { void list.reload(true); }} />
  </View>;
}
