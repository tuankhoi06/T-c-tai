import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { api } from "../api";
import type { Appointment, Barber, HairService, User } from "../types";
import { Button, ComboBox, ErrorText, Field, shopDate, styles, timeLabel } from "../ui";
import { Choice, DataState, DateField, FormModal, useAdminList } from "./components";

function dateInShop(iso: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function AppointmentForm({ visible, item, onClose, onSaved }: {
  visible: boolean;
  item: Appointment | null;
  onClose: () => void;
  onSaved: (appointment: Appointment) => void;
}) {
  const customers = useAdminList<User[]>("/admin/customers", visible && !item);
  const barbers = useAdminList<Barber[]>("/admin/barbers", visible);
  const services = useAdminList<HairService[]>("/admin/services", visible);
  const [customerId, setCustomerId] = useState("");
  const [customerMode, setCustomerMode] = useState<"registered" | "walkin">("registered");
  const [walkInName, setWalkInName] = useState("");
  const [walkInPhone, setWalkInPhone] = useState("");
  const [voucherCode, setVoucherCode] = useState("");
  const [barberId, setBarberId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState(shopDate(1));
  const [startAt, setStartAt] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setCustomerId(item?.customerId || "");
    setCustomerMode("registered"); setWalkInName(""); setWalkInPhone(""); setVoucherCode("");
    setBarberId(item?.barberId || "");
    setServiceId(item?.serviceId || "");
    setDate(item ? dateInShop(item.startAt) : shopDate(1));
    setStartAt(item?.startAt || "");
    setError("");
  }, [visible, item?.id]);

  useEffect(() => {
    if (!visible || !barberId || !serviceId || !date) { setSlots([]); return; }
    let cancelled = false;
    setLoadingSlots(true);
    setError("");
    void api<string[]>(`/availability?barberId=${encodeURIComponent(barberId)}&serviceId=${encodeURIComponent(serviceId)}&date=${encodeURIComponent(date)}`)
      .then((available) => {
        if (cancelled) return;
        const ownSlot = item && item.barberId === barberId && item.serviceId === serviceId && dateInShop(item.startAt) === date ? item.startAt : null;
        const choices = [...new Set([...available, ...(ownSlot ? [ownSlot] : [])])].sort();
        setSlots(choices);
        setStartAt((current) => choices.some((slot) => new Date(slot).getTime() === new Date(current).getTime()) ? current : "");
      })
      .catch((err: Error) => { if (!cancelled) { setSlots([]); setError(err.message); } })
      .finally(() => { if (!cancelled) setLoadingSlots(false); });
    return () => { cancelled = true; };
  }, [visible, barberId, serviceId, date, item?.id]);

  async function save() {
    if (busy) return;
    if ((!item && customerMode === "registered" && !customerId) || (!item && customerMode === "walkin" && walkInName.trim().length < 2) || !barberId || !serviceId || !startAt) { setError("Chọn hoặc nhập khách, thợ, dịch vụ và khung giờ còn trống."); return; }
    setBusy(true); setError("");
    try {
      const appointment = await api<Appointment>(item ? `/admin/appointments/${item.id}` : "/admin/appointments", {
        method: item ? "PATCH" : "POST",
        body: { ...(!item ? customerMode === "walkin" ? { walkInName: walkInName.trim(), walkInPhone: walkInPhone.trim() || undefined } : { customerId } : {}), barberId, serviceId, startAt, ...(!item && voucherCode.trim() ? { voucherCode: voucherCode.trim().toUpperCase() } : {}) }
      });
      onSaved(appointment);
      onClose();
    } catch (err: any) { setError(err.message || "Không lưu được lịch hẹn."); }
    finally { setBusy(false); }
  }

  return <FormModal visible={visible} title={item ? "Sửa lịch hẹn" : "Thêm lịch hẹn"} onClose={() => { if (!busy) onClose(); }}>
    <ErrorText message={error} />
    <DataState loading={barbers.loading || services.loading || customers.loading} error={barbers.error || services.error || customers.error} retry={() => { void barbers.reload(); void services.reload(); if (!item) void customers.reload(); }} />
    {!item && <><Text style={styles.muted}>Loại đặt lịch</Text><Choice value={customerMode} onChange={(value) => setCustomerMode(value as typeof customerMode)} options={[{ label: "Khách đã có hồ sơ", value: "registered" }, { label: "Khách đến trực tiếp", value: "walkin" }]} />
      {customerMode === "registered" ? <><Text style={styles.muted}>Hồ sơ khách hàng</Text><Choice value={customerId} onChange={setCustomerId} options={(customers.data || []).filter((customer) => !customer.blacklisted).map((customer) => ({ label: `${customer.name}${customer.phone ? ` · ${customer.phone}` : ""}`, value: customer.id }))} /></> : <><Field label="Tên khách hàng" value={walkInName} onChange={setWalkInName} /><Field label="Số điện thoại (nếu có)" value={walkInPhone} onChange={setWalkInPhone} numeric /></>}
    </>}
    <ComboBox label="Thợ tóc" value={barberId} onChange={(value) => { setBarberId(value); setStartAt(""); }} options={(barbers.data || []).filter((barber) => barber.active && (!barber.serviceIds || !serviceId || barber.serviceIds.includes(serviceId))).sort((a, b) => a.name.localeCompare(b.name, "vi")).map((barber) => ({ label: barber.name, value: barber.id }))} />
    <Text style={styles.muted}>Dịch vụ</Text>
    <Choice value={serviceId} onChange={(value) => { setServiceId(value); setStartAt(""); }} options={(services.data || []).filter((service) => service.active).map((service) => ({ label: service.name, value: service.id }))} />
    <DateField label="Ngày phục vụ" value={date} onChange={(value) => { setDate(value); setStartAt(""); }} />
    {!item && <Field label="Mã giảm giá (nếu có)" value={voucherCode} onChange={setVoucherCode} />}
    <Text style={styles.muted}>Khung giờ còn trống</Text>
    {loadingSlots ? <Text style={styles.muted}>Đang tải khung giờ...</Text> : slots.length ? <Choice value={startAt} onChange={setStartAt} options={slots.map((slot) => ({ label: timeLabel(slot), value: slot }))} /> : <Text style={styles.muted}>Không có khung giờ phù hợp.</Text>}
    <View style={styles.row}><Button title={busy ? "Đang lưu..." : "Lưu lịch"} disabled={busy || loadingSlots || !startAt} onPress={() => void save()} /><Button title="Quay lại" secondary disabled={busy} onPress={onClose} /></View>
  </FormModal>;
}
