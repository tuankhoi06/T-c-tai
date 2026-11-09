import React, { useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { api } from "../api";
import type { Appointment, Barber, HairService, User, Voucher } from "../types";
import { Avatar, Button, Card, ErrorText, Field, Loading, colors, dateTimeLabel, money, shopDate, styles, timeLabel } from "../ui";
import { servicePhoto } from "../visuals";
import { Choice } from "../admin/components";
import { salonAddress } from "./salon";

export type BookingPreset = { serviceIds?: string[]; barberId?: string; styleName?: string; note?: string; voucherCode?: string };
const categories: { key: HairService["category"]; label: string }[] = [
  { key: "cut", label: "Cắt & tạo kiểu" }, { key: "wash", label: "Gội dưỡng sinh" },
  { key: "chemical", label: "Uốn / nhuộm" }, { key: "care", label: "Chăm sóc" }, { key: "combo", label: "Combo" }
];
const price = (service: HairService) => service.promotionPrice ?? service.price;
const eligible = (barber: Barber, ids: string[]) => barber.active && (!barber.serviceIds || ids.every((id) => barber.serviceIds!.includes(id)));

export function CustomerBooking({ services, barbers, vouchers, user, preset, onBooked, onUserUpdated }: {
  services: HairService[]; barbers: Barber[]; vouchers: Voucher[]; user: User; preset?: BookingPreset;
  onBooked: (item: Appointment) => void; onUserUpdated: (user: User, voucher?: Voucher) => void;
}) {
  const [step, setStep] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>(preset?.serviceIds || []);
  const [barberChoice, setBarberChoice] = useState(preset?.barberId || "any");
  const [dayOffset, setDayOffset] = useState(0);
  const [slots, setSlots] = useState<{ startAt: string; barberId: string }[]>([]);
  const [slot, setSlot] = useState<{ startAt: string; barberId: string } | null>(null);
  const [note, setNote] = useState(preset?.note || "");
  const [voucherCode, setVoucherCode] = useState(preset?.voucherCode || "");
  const [busy, setBusy] = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [error, setError] = useState("");
  const selected = services.filter((item) => selectedIds.includes(item.id));
  const total = selected.reduce((sum, item) => sum + price(item), 0);
  const duration = selected.reduce((sum, item) => sum + item.durationMinutes, 0);
  const candidates = barbers.filter((item) => eligible(item, selectedIds));
  const selectedBarber = barbers.find((item) => item.id === slot?.barberId);
  const voucher = vouchers.find((item) => item.code === voucherCode.trim().toUpperCase());
  const voucherApplicable = voucher && slot && voucher.active && voucher.from <= shopDate(dayOffset) && voucher.to >= shopDate(dayOffset) &&
    (!voucher.startTime || timeLabel(slot.startAt) >= voucher.startTime) && (!voucher.endTime || timeLabel(slot.startAt) < voucher.endTime);
  const estimatedDiscount = voucherApplicable
    ? Math.min(total, voucher.kind === "percent" ? Math.floor(total * voucher.value / 100) : voucher.value) : 0;

  useEffect(() => {
    if (barberChoice !== "any" && !candidates.some((item) => item.id === barberChoice)) setBarberChoice("any");
  }, [selectedIds.join(","), barberChoice, barbers]);

  useEffect(() => {
    if (step !== 3 || selectedIds.length === 0) return;
    let live = true;
    setSlotsLoading(true); setSlot(null); setError("");
    const group = barberChoice === "any" ? candidates : candidates.filter((item) => item.id === barberChoice);
    void Promise.all(group.map(async (barber) => {
      try {
        const query = `barberId=${encodeURIComponent(barber.id)}&serviceId=${encodeURIComponent(selectedIds[0])}&serviceIds=${encodeURIComponent(selectedIds.join(","))}&date=${shopDate(dayOffset)}`;
        const times = await api<string[]>(`/availability?${query}`);
        return times.map((startAt) => ({ startAt, barberId: barber.id }));
      } catch { return []; }
    })).then((result) => {
      if (!live) return;
      const ordered = result.flat().sort((a, b) => a.startAt.localeCompare(b.startAt));
      setSlots(barberChoice === "any" ? [...new Map(ordered.map((item) => [item.startAt, item])).values()] : ordered);
    }).finally(() => { if (live) setSlotsLoading(false); });
    return () => { live = false; };
  }, [step, selectedIds.join(","), barberChoice, dayOffset, barbers]);

  function toggle(id: string) {
    setSelectedIds((items) => items.includes(id) ? items.filter((item) => item !== id) : items.length < 5 ? [...items, id] : items);
  }
  async function redeemPoints() {
    setBusy(true); setError("");
    try {
      const result = await api<{ voucher: Voucher; user: User }>("/loyalty/redeem", { method: "POST" });
      onUserUpdated(result.user, result.voucher); setVoucherCode(result.voucher.code);
    } catch (err: any) { setError(err.message || "Không đổi được điểm."); }
    finally { setBusy(false); }
  }
  async function submit() {
    if (!slot || !selectedIds.length || busy) return;
    setBusy(true); setError("");
    try {
      const item = await api<Appointment>("/appointments", { method: "POST", body: {
        barberId: slot.barberId, serviceId: selectedIds[0], serviceIds: selectedIds, startAt: slot.startAt,
        note: note.trim(), styleName: preset?.styleName, paymentChoice: "salon",
        ...(voucherCode.trim() ? { voucherCode: voucherCode.trim().toUpperCase() } : {})
      } });
      onBooked(item);
    } catch (err: any) { setError(err.message || "Không đặt được lịch. Hãy chọn giờ khác."); }
    finally { setBusy(false); }
  }

  return <View style={{ gap: 14 }}>
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><Text style={styles.subtitle}>Đặt lịch · Bước {step}/4</Text><Text style={styles.muted}>{selectedIds.length} dịch vụ · {duration} phút</Text></View>
    <View style={{ flexDirection: "row", gap: 5 }}>{[1, 2, 3, 4].map((n) => <View key={n} style={{ height: 5, borderRadius: 3, backgroundColor: n <= step ? colors.gold : colors.border, flex: 1 }} />)}</View>
    <ErrorText message={error} />
    {step === 1 && <>
      <Text style={styles.subtitle}>Chọn dịch vụ</Text>
      {categories.map((category) => {
        const items = services.filter((item) => (item.category || "cut") === category.key);
        if (!items.length) return null;
        return <View key={category.key} style={{ gap: 7 }}><Text style={[styles.text, { color: colors.gold, fontWeight: "700" }]}>{category.label}</Text>
          {items.map((item) => <Pressable key={item.id} onPress={() => toggle(item.id)} style={[styles.card, { flexDirection: "row", padding: 0, overflow: "hidden" }, selectedIds.includes(item.id) && { borderColor: colors.gold, borderWidth: 2 }]}>
            <Image source={item.imageUrl ? { uri: item.imageUrl } : servicePhoto(item.name)} style={{ width: 85, minHeight: 95 }} />
            <View style={{ flex: 1, padding: 11, gap: 4 }}><Text style={[styles.text, { fontWeight: "700" }]}>{selectedIds.includes(item.id) ? "✓ " : "+ "}{item.name}</Text><Text style={styles.muted} numberOfLines={2}>{item.description}</Text><Text style={{ color: colors.gold }}>{money(price(item))} · {item.durationMinutes} phút</Text></View>
          </Pressable>)}</View>;
      })}
      <Card><Text style={styles.text}>Tổng tạm tính: {money(total)} · {duration} phút</Text></Card>
      <View style={styles.row}><Button title="⚡ Chọn giờ nhanh · Thợ bất kỳ" disabled={!selectedIds.length} onPress={() => { setBarberChoice("any"); setStep(3); }} /><Button title="Tự chọn thợ" secondary disabled={!selectedIds.length} onPress={() => setStep(2)} /></View>
    </>}
    {step === 2 && <>
      <Text style={styles.subtitle}>Chọn thợ phù hợp</Text>
      <Pressable onPress={() => setBarberChoice("any")} style={[styles.card, barberChoice === "any" && { borderColor: colors.gold, borderWidth: 2 }]}><Text style={styles.text}>⚡ Chọn giúp tôi thợ rảnh sớm nhất</Text><Text style={styles.muted}>Ưu tiên khung giờ còn trống đầu tiên của mọi thợ phù hợp.</Text></Pressable>
      {candidates.map((item) => <Pressable key={item.id} onPress={() => setBarberChoice(item.id)} style={[styles.card, { flexDirection: "row", alignItems: "center", gap: 11 }, barberChoice === item.id && { borderColor: colors.gold, borderWidth: 2 }]}>
        <Avatar name={item.name} uri={item.imageUrl || undefined} size={54} />
        <View style={{ flex: 1 }}><Text style={styles.text}>{item.name} · {item.title === "master" ? "Master" : item.title === "top" ? "Top Stylist" : "Stylist"}</Text><Text style={styles.muted}>{item.ratingAverage == null ? "Chưa có đánh giá" : `★ ${item.ratingAverage}/5 · ${item.reviewCount} đánh giá`}</Text><Text style={styles.muted} numberOfLines={2}>{item.bio}</Text>
          {!!item.portfolio?.length && <ScrollView horizontal contentContainerStyle={{ gap: 6, paddingTop: 6 }}>{item.portfolio.map((example, index) => <View key={`${example.styleName}-${index}`} style={{ alignItems: "center", width: 74, gap: 3 }}>{example.photo ? <Image source={{ uri: example.photo }} style={{ width: 62, height: 50, borderRadius: 6 }} /> : null}<Text style={[styles.muted, { fontSize: 10 }]} numberOfLines={1}>{example.styleName}</Text></View>)}</ScrollView>}
        </View>
      </Pressable>)}
      {!candidates.length && <Card><Text style={styles.muted}>Chưa có thợ thực hiện đủ các dịch vụ này. Vui lòng chọn combo khác.</Text></Card>}
      <View style={styles.row}><Button title="Quay lại" secondary onPress={() => setStep(1)} /><Button title="Tiếp tục · Chọn giờ" disabled={!candidates.length} onPress={() => setStep(3)} /></View>
    </>}
    {step === 3 && <>
      <Text style={styles.subtitle}>Chọn ngày và giờ</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
        {Array.from({ length: 14 }, (_, offset) => <Pressable key={offset} onPress={() => setDayOffset(offset)} style={[styles.card, { minWidth: 75, alignItems: "center", padding: 9 }, offset === dayOffset && { backgroundColor: colors.gold }]}><Text style={[styles.text, offset === dayOffset && { color: colors.dark }]}>{offset === 0 ? "Hôm nay" : offset === 1 ? "Ngày mai" : `+${offset} ngày`}</Text><Text style={[styles.muted, offset === dayOffset && { color: colors.dark }]}>{shopDate(offset).slice(5)}</Text></Pressable>)}
      </ScrollView>
      {slotsLoading ? <Loading /> : <View style={styles.row}>
        {Array.from({ length: 21 }, (_, i) => `${String(9 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`).map((time) => {
          const found = slots.find((item) => timeLabel(item.startAt) === time);
          return <Pressable key={time} disabled={!found} onPress={() => { setSlot(found!); setStep(4); }} style={[styles.card, { padding: 9, minWidth: 70, opacity: found ? 1 : 0.35, alignItems: "center" }, slot?.startAt === found?.startAt && found && { backgroundColor: colors.gold }]}><Text style={[styles.text, slot?.startAt === found?.startAt && found && { color: colors.dark }]}>{time}</Text></Pressable>;
        })}
      </View>}
      {!slotsLoading && !slots.length && <Text style={styles.muted}>Ngày này đã kín hoặc thợ nghỉ. Thử ngày khác.</Text>}
      <Button title="Quay lại dịch vụ / thợ" secondary onPress={() => setStep(2)} />
    </>}
    {step === 4 && <>
      <Text style={styles.subtitle}>Kiểm tra và xác nhận</Text>
      <Card style={{ borderColor: colors.gold }}><Text style={styles.text}>HairMatch{salonAddress ? ` · ${salonAddress}` : ""}</Text><Text style={styles.text}>{slot && dateTimeLabel(slot.startAt)} · {duration} phút</Text><Text style={styles.text}>Thợ: {selectedBarber?.name}</Text>{selected.map((item) => <Text key={item.id} style={styles.muted}>{item.name} · {money(price(item))}</Text>)}{preset?.styleName && <Text style={styles.muted}>Kiểu mong muốn: {preset.styleName}</Text>}<Text style={[styles.subtitle, { color: colors.gold }]}>Tạm tính {money(total)}</Text></Card>
      <Field label="Ghi chú cho thợ (tùy chọn)" value={note} onChange={setNote} multiline />
      <Field label="Mã ưu đãi" value={voucherCode} onChange={setVoucherCode} />
      {!!voucherCode.trim() && !voucherApplicable && <Text style={styles.muted}>Mã chưa áp dụng cho ngày/giờ này hoặc đã hết lượt.</Text>}
      <View style={styles.row}>{vouchers.slice(0, 3).map((item) => <Button key={item.id} title={item.code} secondary onPress={() => setVoucherCode(item.code)} />)}</View>
      {(user.loyaltyPoints || 0) >= 100 && <Button title="Đổi 100 điểm lấy mã giảm 50.000đ" secondary disabled={busy} onPress={() => void redeemPoints()} />}
      <Text style={styles.text}>Tổng dự kiến: {money(total - estimatedDiscount)}{estimatedDiscount > 0 ? ` · giảm ${money(estimatedDiscount)}` : ""}</Text>
      <Choice value="salon" onChange={() => {}} options={[{ label: "Thanh toán tại salon", value: "salon" }]} />
      <Text style={styles.muted}>Thanh toán trước sẽ có khi salon kết nối cổng thanh toán.</Text>
      <View style={styles.row}><Button title="Quay lại" secondary onPress={() => setStep(3)} /><Button title={busy ? "Đang đặt..." : "Xác nhận đặt lịch"} disabled={busy} onPress={() => void submit()} /></View>
    </>}
  </View>;
}
