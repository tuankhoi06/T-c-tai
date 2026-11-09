import React, { useEffect, useState } from "react";
import { Image, Linking, Text, View } from "react-native";
import { api } from "../api";
import type { Appointment, User, Voucher } from "../types";
import { Button, Card, ErrorText, Field, colors, money, styles } from "../ui";
import { DateField } from "../admin/components";
import { salonAddress, salonMapsUrl, salonPhone } from "./salon";

export function CustomerProfile({ user, appointments, vouchers, onUserUpdated, onLogout }: {
  user: User; appointments: Appointment[]; vouchers: Voucher[];
  onUserUpdated: (user: User, voucher?: Voucher) => void; onLogout: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [birthday, setBirthday] = useState(user.birthday || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [supportText, setSupportText] = useState("");
  const [supportMessages, setSupportMessages] = useState<{ id: string; body: string; reply?: string; createdAt: string }[]>([]);
  useEffect(() => {
    let live = true;
    const load = async () => { try { const items = await api<typeof supportMessages>("/support/messages/me"); if (live) setSupportMessages(items); } catch {} };
    void load(); const timer = setInterval(() => { void load(); }, 15000);
    return () => { live = false; clearInterval(timer); };
  }, []);
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
  async function sendSupport() {
    if (supportText.trim().length < 2 || busy) return;
    setBusy(true); setError("");
    try { await api("/support/messages", { method: "POST", body: { body: supportText.trim() } });
      setSupportText(""); setSupportMessages(await api<typeof supportMessages>("/support/messages/me"));
    } catch (err: any) { setError(err.message || "Không gửi được tin nhắn."); }
    finally { setBusy(false); }
  }
  const gallery = appointments.filter((item) => item.status === "completed" && (item.reviewPhoto || item.styleName));
  return <View style={{ gap: 12 }}>
    <Text style={styles.subtitle}>Hồ sơ của tôi</Text><ErrorText message={error} />{!!message && <Text style={{ color: colors.gold }}>{message}</Text>}
    <Card><Text style={styles.subtitle}>{user.name}</Text><Text style={styles.muted}>{user.phone || user.email} · Hạng {user.tier === "vip" ? "VIP" : user.tier === "gold" ? "Vàng" : "Bạc"}</Text>
      <Text style={[styles.subtitle, { color: colors.gold }]}>{user.loyaltyPoints || 0} điểm thưởng</Text><Text style={styles.muted}>Mỗi 10.000đ thanh toán tại salon được 1 điểm. Đổi 100 điểm lấy mã giảm 50.000đ.</Text>
      <Button title="Đổi 100 điểm" disabled={busy || (user.loyaltyPoints || 0) < 100} secondary onPress={() => void redeem()} />
    </Card>
    <Card><Text style={styles.subtitle}>Thông tin cá nhân</Text><Field label="Họ và tên" value={name} onChange={setName} /><Text style={styles.muted}>Số điện thoại: {user.phone || "Chưa có"}</Text>
      <DateField label="Ngày sinh (nhận mã ưu đãi sinh nhật)" value={birthday} onChange={setBirthday} />
      <Button title={busy ? "Đang lưu..." : "Lưu hồ sơ"} disabled={busy || name.trim().length < 2} onPress={() => void save()} />
    </Card>
    <Text style={styles.subtitle}>Ví ưu đãi</Text>
    {!vouchers.length && <Card><Text style={styles.muted}>Chưa có mã giảm giá khả dụng.</Text></Card>}
    {vouchers.map((item) => <Card key={item.id}><Text style={[styles.text, { color: colors.gold, fontWeight: "700" }]}>{item.code} · {item.kind === "percent" ? `${item.value}%` : money(item.value)}</Text><Text style={styles.muted}>Hạn dùng {item.to}{item.ownerId ? " · Dành riêng cho bạn" : ""}</Text></Card>)}
    <Text style={styles.subtitle}>Nhật ký tóc</Text>
    {!gallery.length && <Card><Text style={styles.muted}>Ảnh đánh giá và kiểu tóc đã lưu sẽ xuất hiện ở đây.</Text></Card>}
    {gallery.map((item) => <Card key={item.id} style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>{!!item.reviewPhoto && <Image source={{ uri: item.reviewPhoto }} style={{ width: 72, height: 72, borderRadius: 9 }} />}<View style={{ flex: 1 }}><Text style={styles.text}>{item.styleName || item.serviceNameSnapshot}</Text><Text style={styles.muted}>{item.startAt.slice(0, 10)} · {item.barberNameSnapshot}</Text></View></Card>)}
    <Text style={styles.subtitle}>Hỗ trợ & liên hệ</Text><Card><Text style={styles.muted}>{salonAddress || "Địa chỉ salon chưa được cấu hình."}</Text><View style={styles.row}>{!!salonPhone && <Button title={`Gọi ${salonPhone}`} secondary onPress={() => void Linking.openURL(`tel:${salonPhone}`)} />}{!!salonMapsUrl && <Button title="Chỉ đường" secondary onPress={() => void Linking.openURL(salonMapsUrl)} />}</View><Text style={styles.muted}>Zalo/Messenger cần tài khoản chính thức của salon.</Text></Card>
    <Card><Text style={styles.subtitle}>Nhắn tin với tiệm</Text><Field label="Bạn cần hỗ trợ gì?" value={supportText} onChange={setSupportText} multiline /><Button title={busy ? "Đang gửi..." : "Gửi tin nhắn"} disabled={busy || supportText.trim().length < 2} onPress={() => void sendSupport()} />
      {supportMessages.map((item) => <View key={item.id} style={{ gap: 3, borderTopWidth: 1, borderColor: colors.border, paddingTop: 8 }}><Text style={styles.text}>Bạn: {item.body}</Text><Text style={styles.muted}>Salon: {item.reply || "Đang chờ phản hồi"}</Text></View>)}
    </Card>
    <Button title="Đăng xuất" secondary onPress={onLogout} />
  </View>;
}
