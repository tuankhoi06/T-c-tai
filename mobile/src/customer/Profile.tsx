import React, { useState } from "react";
import { Image, Linking, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { api } from "../api";
import type { Appointment, User, Voucher } from "../types";
import { Button, Card, ErrorText, Field, colors, money, styles } from "../ui";
import { DateField, FormModal } from "../admin/components";
import { demoBranches, mapsUrlFor, salonPhone } from "./salon";

export function CustomerProfile({ user, appointments, vouchers, onUserUpdated, onLogout }: {
  user: User; appointments: Appointment[]; vouchers: Voucher[];
  onUserUpdated: (user: User, voucher?: Voucher) => void; onLogout: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [birthday, setBirthday] = useState(user.birthday || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [section, setSection] = useState<"hair" | "contact" | null>(null);
  const [confirmDeletion, setConfirmDeletion] = useState(false);
  const [deletionError, setDeletionError] = useState("");
  async function save() {
    setBusy(true); setError(""); setMessage("");
    try {
      const updated = await api<User>("/me", { method: "PATCH", body: { name: name.trim(), ...(birthday ? { birthday } : {}) } });
      onUserUpdated(updated); setMessage("Đã lưu hồ sơ.");
    } catch (err: any) { setError(err.message || "Không lưu được hồ sơ."); }
    finally { setBusy(false); }
  }
  async function redeem() {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await api<{ user: User; voucher: Voucher }>("/loyalty/redeem", { method: "POST" });
      onUserUpdated(result.user, result.voucher); setMessage(`Đã đổi mã ${result.voucher.code}.`);
    } catch (err: any) { setError(err.message || "Không đổi được điểm."); }
    finally { setBusy(false); }
  }
  function requestDeletion() {
    setDeletionError("");
    setConfirmDeletion(true);
  }
  async function deleteAccount() {
    setBusy(true); setDeletionError("");
    try {
      await api("/me", { method: "DELETE" });
      setConfirmDeletion(false);
      onLogout();
    } catch (err: any) {
      setDeletionError(err.message || "Không xóa được tài khoản.");
    } finally { setBusy(false); }
  }
  const history = appointments.filter((item) => item.status === "completed").sort((a, b) => b.startAt.localeCompare(a.startAt));
  return <View style={{ gap: 12 }}>
    <Text style={styles.subtitle}>Hồ sơ của tôi</Text><ErrorText message={error} />{!!message && <Text style={{ color: colors.gold }}>{message}</Text>}
    <Card><Text style={styles.subtitle}>{user.name}</Text><Text style={styles.muted}>{user.phone || "Chưa có số điện thoại"}</Text>
      <Text style={styles.muted}>Số lần vắng mặt: {user.noShowCount || 0}/2{(user.noShowCount || 0) >= 2 ? " · Gọi hotline để đặt lịch" : ""}</Text>
      <Text style={[styles.subtitle, { color: colors.gold }]}>{user.loyaltyPoints || 0} điểm thưởng</Text><Text style={styles.muted}>Mỗi 10.000đ thanh toán tại salon được 1 điểm. Đổi 100 điểm lấy mã giảm 50.000đ.</Text>
      <Button title="Đổi 100 điểm" disabled={busy || (user.loyaltyPoints || 0) < 100} secondary onPress={() => void redeem()} />
    </Card>
    <Card><Text style={styles.subtitle}>Thông tin cá nhân</Text><Field label="Họ và tên" value={name} onChange={setName} /><Text style={styles.muted}>Số điện thoại: {user.phone || "Chưa có"}</Text>
      <DateField label="Ngày sinh (nhận mã ưu đãi sinh nhật)" value={birthday} onChange={setBirthday} />
      <Button title={busy ? "Đang lưu..." : "Lưu hồ sơ"} disabled={busy || name.trim().length < 2} onPress={() => void save()} />
    </Card>
    <Card style={{ gap: 11 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <Text style={styles.subtitle}>Ví ưu đãi</Text>
        <Text style={[styles.muted, { fontSize: 12 }]}>{vouchers.length} mã</Text>
      </View>
      {!vouchers.length && <Text style={styles.muted}>Chưa có mã giảm giá khả dụng.</Text>}
      {!!vouchers.length && <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {vouchers.map((item) => <View key={item.id} style={{ flexGrow: 1, flexBasis: 140, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, borderRadius: 11, padding: 11, gap: 3 }}>
          <Text style={[styles.text, { color: colors.gold, fontWeight: "800" }]}>{item.code}</Text>
          <Text style={[styles.muted, { fontWeight: "700" }]}>{item.kind === "percent" ? `Giảm ${item.value}%` : `Giảm ${money(item.value)}`}</Text>
          <Text style={[styles.muted, { fontSize: 11 }]}>Hạn {item.to}{item.ownerId ? " · Riêng bạn" : ""}</Text>
        </View>)}
      </View>}
    </Card>
    <Pressable accessibilityRole="button" onPress={() => setSection("hair")} style={styles.card}><Text style={styles.subtitle}>Nhật ký tóc</Text><Text style={styles.muted}>Xem lịch sử {history.length} lần đến tiệm · kiểu tóc và đánh giá</Text></Pressable>
    <Pressable accessibilityRole="button" onPress={() => setSection("contact")} style={styles.card}><Text style={styles.subtitle}>Liên hệ salon</Text><Text style={styles.muted}>Xem địa chỉ chi nhánh và chỉ đường</Text></Pressable>
    <Pressable accessibilityRole="button" onPress={requestDeletion} style={[styles.button, { backgroundColor: colors.danger }]}><Text style={[styles.buttonText, { color: colors.text }]}>Xóa tài khoản</Text></Pressable>
    <Button title="Đăng xuất" secondary onPress={onLogout} />
    <FormModal title="Xác nhận xóa tài khoản" visible={confirmDeletion} onClose={() => { if (!busy) setConfirmDeletion(false); }}>
      <View style={{ gap: 10 }}>
        <View style={{ borderWidth: 1, borderColor: colors.danger, borderRadius: 12, padding: 12, backgroundColor: colors.input, gap: 5 }}>
          <Text style={[styles.text, { fontWeight: "700" }]}>Bạn muốn xóa tài khoản?</Text>
          <Text style={styles.muted}>Tài khoản sẽ bị xóa ngay, không cần Admin duyệt. Lịch hẹn chưa hoàn tất sẽ tự hủy; lịch sử còn lại được ẩn danh.</Text>
        </View>
        <ErrorText message={deletionError} />
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void deleteAccount()} style={[styles.button, { backgroundColor: colors.danger }, busy && { opacity: 0.5 }]}><Text style={styles.buttonText}>{busy ? "Đang xóa..." : "Xác nhận xóa tài khoản"}</Text></Pressable>
        <Button title="Giữ tài khoản" secondary disabled={busy} onPress={() => setConfirmDeletion(false)} />
      </View>
    </FormModal>
    <Modal visible={!!section} animationType="slide" onRequestClose={() => setSection(null)}>
      <View style={{ flex: 1, backgroundColor: colors.background }}><ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Button title="← Hồ sơ" secondary onPress={() => setSection(null)} />
        {section === "hair" ? <>
          <Text style={styles.subtitle}>Lịch sử đến tiệm</Text>
          {!history.length && <Card><Text style={styles.muted}>Lịch sử các lần sử dụng dịch vụ sẽ hiển thị tại đây.</Text></Card>}
          {history.map((item) => <Card key={item.id} style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>{!!item.reviewPhoto && <Image source={{ uri: item.reviewPhoto }} style={{ width: 72, height: 72, borderRadius: 9 }} />}<View style={{ flex: 1 }}><Text style={styles.text}>{item.styleName || item.serviceNameSnapshot}</Text><Text style={styles.muted}>{item.startAt.slice(0, 10)} · {item.barberNameSnapshot}</Text>{!!item.review && <Text style={styles.muted}>Đánh giá: {item.review}</Text>}</View></Card>)}
        </> : section === "contact" ? <>
          <Text style={styles.subtitle}>Liên hệ salon</Text>
          <Card><Text style={styles.muted}>Hotline demo: {salonPhone}</Text></Card>
          {demoBranches.map((branch) => <Card key={branch.id}><Text style={styles.subtitle}>{branch.name}</Text><Text style={styles.text}>{branch.address}</Text><Button title="Mở bản đồ" secondary onPress={() => void Linking.openURL(mapsUrlFor(branch.address))} /></Card>)}
        </> : null}
      </ScrollView></View>
    </Modal>
  </View>;
}
