import React, { useEffect, useState } from "react";
import { Image, Linking, Pressable, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { api } from "../api";
import type { Appointment } from "../types";
import { Button, Card, DragScrollView, ErrorText, Field, Loading, colors, dateTimeLabel, money, shopDate, statusLabel, styles, timeLabel } from "../ui";
import { Choice, FormModal } from "../admin/components";
import type { BookingPreset } from "./Booking";
import { salonMapsUrl } from "./salon";

const canChange = (item: Appointment) => ["pending", "confirmed"].includes(item.status) && new Date(item.startAt).getTime() - Date.now() >= 2 * 60 * 60 * 1000;

export function CustomerBookings({ appointments, onChanged, onRebook }: {
  appointments: Appointment[]; onChanged: () => Promise<void>; onRebook: (preset: BookingPreset) => void;
}) {
  const [tab, setTab] = useState<"upcoming" | "history">("upcoming");
  const [cancelItem, setCancelItem] = useState<Appointment | null>(null);
  const [reason, setReason] = useState("");
  const [moveItem, setMoveItem] = useState<Appointment | null>(null);
  const [moveOffset, setMoveOffset] = useState(0);
  const [moveSlots, setMoveSlots] = useState<string[]>([]);
  const [moveSlot, setMoveSlot] = useState("");
  const [reviewItem, setReviewItem] = useState<Appointment | null>(null);
  const [rating, setRating] = useState("5");
  const [review, setReview] = useState("");
  const [photo, setPhoto] = useState("");
  const [portfolioConsent, setPortfolioConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!moveItem) return;
    let live = true;
    setMoveSlot(""); setLoadingSlots(true);
    const ids = moveItem.serviceIds || [moveItem.serviceId];
    void api<string[]>(`/availability?barberId=${moveItem.barberId}&serviceId=${ids[0]}&serviceIds=${ids.join(",")}&date=${shopDate(moveOffset)}`)
      .then((items) => { if (live) setMoveSlots(items); })
      .catch(() => { if (live) setMoveSlots([]); })
      .finally(() => { if (live) setLoadingSlots(false); });
    return () => { live = false; };
  }, [moveItem?.id, moveOffset]);

  async function cancel() {
    if (!cancelItem || reason.trim().length < 3 || busy) return;
    setBusy(true); setError("");
    try {
      await api(`/appointments/${cancelItem.id}/cancel`, { method: "PATCH", body: { reason: reason.trim() } });
      setCancelItem(null); setReason(""); await onChanged();
    } catch (err: any) { setError(err.message || "Không hủy được lịch."); }
    finally { setBusy(false); }
  }
  async function reschedule() {
    if (!moveItem || !moveSlot || busy) return;
    setBusy(true); setError("");
    try {
      await api(`/appointments/${moveItem.id}/reschedule`, { method: "PATCH", body: { barberId: moveItem.barberId, startAt: moveSlot } });
      setMoveItem(null); await onChanged();
    } catch (err: any) { setError(err.message || "Không đổi được giờ."); }
    finally { setBusy(false); }
  }
  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (result.canceled || !result.assets[0]) return;
    try {
      const compressed = await manipulateAsync(result.assets[0].uri, [{ resize: { width: 520 } }], { compress: 0.55, format: SaveFormat.JPEG, base64: true });
      const encoded = `data:image/jpeg;base64,${compressed.base64}`;
      if (encoded.length > 350000) { setError("Ảnh quá lớn. Vui lòng chọn ảnh khác."); return; }
      setPhoto(encoded);
    } catch { setError("Không đọc được ảnh."); }
  }
  async function submitReview() {
    if (!reviewItem || busy) return;
    setBusy(true); setError("");
    try {
      await api(`/appointments/${reviewItem.id}/review`, { method: "POST", body: { rating: Number(rating), review: review.trim(), ...(photo ? { photo } : {}), portfolioConsent } });
      setReviewItem(null); setPhoto(""); setReview(""); await onChanged();
    } catch (err: any) { setError(err.message || "Không gửi được đánh giá."); }
    finally { setBusy(false); }
  }
  async function refreshAppointments() {
    if (refreshing) return;
    setRefreshing(true);
    try { await onChanged(); }
    finally { setRefreshing(false); }
  }
  const items = appointments.filter((item) => tab === "upcoming" ? ["pending", "confirmed", "in_progress"].includes(item.status) : ["completed", "cancelled", "no_show"].includes(item.status));
  return <View style={{ gap: 12 }}>
    <Text style={styles.subtitle}>Lịch của tôi</Text>
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <View style={{ flex: 1 }}><Choice value={tab} onChange={(value) => setTab(value as typeof tab)} options={[{ label: "Sắp tới", value: "upcoming" }, { label: "Lịch sử", value: "history" }]} /></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Tải lại lịch" disabled={refreshing} onPress={() => void refreshAppointments()} style={[styles.button, styles.buttonSecondary, { width: 44, height: 44, minHeight: 44, padding: 0, borderRadius: 11, opacity: refreshing ? 0.55 : 1 }]}>
        <Text style={[styles.text, { fontSize: 24, lineHeight: 28, color: colors.gold }]}>{refreshing ? "⟳" : "↻"}</Text>
      </Pressable>
    </View>
    <ErrorText message={error} />
    {!items.length && <Card><Text style={styles.muted}>{tab === "upcoming" ? "Chưa có lịch sắp tới." : "Chưa có lịch sử phục vụ."}</Text></Card>}
    {items.map((item) => <Card key={item.id} style={{ gap: 7 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}><Text style={[styles.text, { fontWeight: "700", flex: 1 }]}>{item.serviceNameSnapshot}</Text><Text style={{ color: colors.gold }}>{statusLabel[item.status]}</Text></View>
      <Text style={styles.text}>{dateTimeLabel(item.startAt)} · {item.durationSnapshot} phút</Text>
      <Text style={styles.muted}>Thợ {item.barberNameSnapshot} · {money(item.priceSnapshot)}</Text>
      {item.paymentChoice === "prepay" && <Text style={styles.muted}>Thanh toán mô phỏng: {item.simulatedPaid ? `Đã ghi nhận ${money(item.simulatedPaid)} · ${item.simulatedPaymentReference}` : `Chưa thanh toán ${money(item.depositRequired || item.priceSnapshot)}`}</Text>}
      {tab === "upcoming" && item.paymentChoice === "prepay" && !item.simulatedPaid && <Button title={`Mô phỏng thanh toán ${money(item.depositRequired || item.priceSnapshot)}`} disabled={busy} onPress={() => { setBusy(true); void api(`/appointments/${item.id}/simulate-payment`, { method: "POST" }).then(onChanged).catch((err) => setError(err.message || "Không ghi nhận được thanh toán.")).finally(() => setBusy(false)); }} />}
      {tab === "upcoming" && <><Text style={[styles.muted, { fontFamily: "monospace" }]}>Mã nhận lịch tại quầy: {item.id.slice(0, 8).toUpperCase()}</Text>
        <View style={styles.row}>{!!salonMapsUrl && <Button title="Chỉ đường" secondary onPress={() => void Linking.openURL(salonMapsUrl)} />}
          {canChange(item) && <><Button title="Đổi giờ" secondary onPress={() => { setError(""); setMoveOffset(0); setMoveItem(item); }} /><Button title="Hủy lịch" secondary onPress={() => { setError(""); setCancelItem(item); }} /></>}
        </View>
        {!canChange(item) && item.status !== "in_progress" && <Text style={styles.muted}>Đổi/hủy trước giờ hẹn ít nhất 2 tiếng. Sau mốc này, vui lòng gọi salon.</Text>}
      </>}
      {tab === "history" && <View style={styles.row}>
        <Button title="Đặt lại lịch này" secondary onPress={() => onRebook({ serviceIds: item.serviceIds || [item.serviceId], barberId: item.barberId, styleName: item.styleName, note: item.note })} />
        {item.status === "completed" && !item.rating && <Button title="Đánh giá" secondary onPress={() => { setError(""); setReviewItem(item); setRating("5"); setReview(""); setPhoto(""); setPortfolioConsent(false); }} />}
      </View>}
      {item.rating && <Text style={styles.muted}>★ {item.rating}/5 {item.review || ""}</Text>}
      {!!item.reviewPhoto && <Image source={{ uri: item.reviewPhoto }} style={{ width: 96, height: 96, borderRadius: 9 }} />}
    </Card>)}
    <FormModal visible={!!cancelItem} title="Hủy lịch hẹn" onClose={() => { if (!busy) setCancelItem(null); }}>
      <Text style={styles.muted}>Chỉ được hủy trước giờ hẹn ít nhất 2 tiếng. Mã ưu đãi sẽ được hoàn lượt dùng.</Text><ErrorText message={error} />
      <Field label="Lý do hủy" value={reason} onChange={setReason} multiline />
      <Button title={busy ? "Đang hủy..." : "Xác nhận hủy"} disabled={busy || reason.trim().length < 3} onPress={() => void cancel()} />
    </FormModal>
    <FormModal visible={!!moveItem} title="Đổi giờ hẹn" onClose={() => { if (!busy) setMoveItem(null); }}>
      <Text style={styles.muted}>Giữ nguyên thợ và dịch vụ. Chọn giờ trống trong 14 ngày tới.</Text><ErrorText message={error} />
      <DragScrollView horizontal contentContainerStyle={{ gap: 5 }}>{Array.from({ length: 14 }, (_, n) => <Button key={n} title={shopDate(n).slice(5)} secondary={n !== moveOffset} onPress={() => setMoveOffset(n)} />)}</DragScrollView>
      {loadingSlots ? <Loading /> : <View style={styles.row}>{moveSlots.map((value) => <Button key={value} title={timeLabel(value)} secondary={moveSlot !== value} onPress={() => setMoveSlot(value)} />)}</View>}
      {!loadingSlots && !moveSlots.length && <Text style={styles.muted}>Không còn giờ phù hợp ngày này.</Text>}
      <Button title={busy ? "Đang lưu..." : "Lưu giờ mới"} disabled={busy || !moveSlot} onPress={() => void reschedule()} />
    </FormModal>
    <FormModal visible={!!reviewItem} title="Đánh giá trải nghiệm" onClose={() => { if (!busy) setReviewItem(null); }}>
      <ErrorText message={error} /><Choice value={rating} onChange={setRating} options={[1, 2, 3, 4, 5].map((n) => ({ label: `★ ${n}`, value: String(n) }))} />
      <Field label="Nhận xét" value={review} onChange={setReview} multiline />
      <Button title="Thêm ảnh tóc sau khi cắt" secondary onPress={() => void pickPhoto()} />
      {!!photo && <Image source={{ uri: photo }} style={{ width: 110, height: 110, borderRadius: 9 }} />}
      <Pressable onPress={() => setPortfolioConsent((value) => !value)}><Text style={styles.muted}>{portfolioConsent ? "☑" : "□"} Cho phép salon dùng ảnh/kiểu tóc trong portfolio thợ</Text></Pressable>
      <Button title={busy ? "Đang gửi..." : "Gửi đánh giá"} disabled={busy} onPress={() => void submitReview()} />
    </FormModal>
  </View>;
}
