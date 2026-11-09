import React, { useState } from "react";
import { Text, View } from "react-native";
import { api } from "../api";
import type { Notification, User, Voucher } from "../types";
import { Button, Card, colors, ErrorText, Field, money, shopDate, styles } from "../ui";
import { Choice, DataState, DateField, TimeField, useAdminList } from "./components";

const blank = { code: "", kind: "percent", value: "10", maxUses: "50", from: shopDate(), to: shopDate(30), startTime: "", endTime: "", active: true };
export function MarketingAdmin({ active }: { active: boolean }) {
  const vouchers = useAdminList<Voucher[]>("/admin/vouchers", active);
  const notifications = useAdminList<Notification[]>("/admin/notifications", active);
  const customers = useAdminList<User[]>("/admin/customers", active);
  const [editing, setEditing] = useState<Voucher | "new" | null>(null);
  const [form, setForm] = useState(blank);
  const [target, setTarget] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  function open(item: Voucher | "new") {
    setEditing(item); setError("");
    setForm(item === "new" ? blank : { code: item.code, kind: item.kind, value: String(item.value), maxUses: String(item.maxUses), from: item.from, to: item.to, startTime: item.startTime || "", endTime: item.endTime || "", active: item.active });
  }
  async function saveVoucher() {
    if (!editing || busy) return;
    const value = Number(form.value), maxUses = Number(form.maxUses);
    if (!form.code.trim() || !Number.isInteger(value) || value < 1 || !Number.isInteger(maxUses) || maxUses < 1 || form.from > form.to || (form.kind === "percent" && value > 100)) { setError("Kiểm tra mã, giá trị, lượt dùng và ngày áp dụng."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const isNew = editing === "new";
      await api(isNew ? "/admin/vouchers" : `/admin/vouchers/${editing.id}`, { method: isNew ? "POST" : "PATCH", body: { code: form.code.trim().toUpperCase(), kind: form.kind, value, maxUses, from: form.from, to: form.to, startTime: form.startTime || null, endTime: form.endTime || null, active: form.active } });
      setEditing(null); setMessage("Đã lưu mã ưu đãi."); await vouchers.reload();
    } catch (err: any) { setError(err.message || "Không lưu được mã."); }
    finally { setBusy(false); }
  }
  async function removeVoucher(id: string) {
    if (busy) return;
    setBusy(true); setError("");
    try { await api(`/admin/vouchers/${id}`, { method: "DELETE" }); await vouchers.reload(); setMessage("Đã xóa mã."); }
    catch (err: any) { setError(err.message || "Không xóa được mã."); }
    finally { setBusy(false); }
  }
  async function send() {
    if (busy || title.trim().length < 2 || body.trim().length < 2) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await api<{ sentCount: number; delivery: string; push: { attempted: number; accepted: number } }>("/admin/notifications", { method: "POST", body: { customerId: target || undefined, title: title.trim(), body: body.trim() } });
      setTitle(""); setBody(""); setMessage(`Đã gửi thông báo trong app tới ${result.sentCount} khách. Push: ${result.push.accepted}/${result.push.attempted} được dịch vụ nhận.`); await notifications.reload();
    } catch (err: any) { setError(err.message || "Không gửi được thông báo."); }
    finally { setBusy(false); }
  }
  return <View style={{ gap: 13 }}>
    <Text style={styles.subtitle}>Mã khuyến mãi</Text>
    <Button title="Tạo mã mới" onPress={() => open("new")} />
    <DataState loading={vouchers.loading} error={vouchers.error} retry={() => void vouchers.reload()} />
    {vouchers.data?.map((item) => <Card key={item.id}>
      <Text style={styles.subtitle}>{item.code} · {item.kind === "percent" ? `${item.value}%` : money(item.value)}</Text>
      <Text style={styles.muted}>{item.from} → {item.to}{item.startTime ? ` · ${item.startTime}–${item.endTime || "23:59"}` : ""}</Text>
      <Text style={styles.muted}>Đã dùng {item.usedCount}/{item.maxUses} · {item.active ? "Đang hoạt động" : "Tạm ngừng"}</Text>
      <View style={styles.row}><Button title="Sửa" secondary onPress={() => open(item)} /><Button title="Xóa" secondary disabled={busy} onPress={() => void removeVoucher(item.id)} /></View>
    </Card>)}
    {editing && <Card><Text style={styles.subtitle}>{editing === "new" ? "Tạo mã" : "Sửa mã"}</Text><ErrorText message={error} />
      <Field label="Mã" value={form.code} onChange={(code) => setForm({ ...form, code })} />
      <Text style={styles.muted}>Loại giảm</Text><Choice value={form.kind} onChange={(kind) => setForm({ ...form, kind })} options={[{ label: "Phần trăm", value: "percent" }, { label: "Số tiền", value: "fixed" }]} />
      <Field label={form.kind === "percent" ? "Giảm (%)" : "Giảm (VNĐ)"} value={form.value} onChange={(value) => setForm({ ...form, value })} numeric />
      <Field label="Số lượt tối đa" value={form.maxUses} onChange={(maxUses) => setForm({ ...form, maxUses })} numeric />
      <DateField label="Bắt đầu" value={form.from} onChange={(from) => setForm({ ...form, from })} /><DateField label="Kết thúc" value={form.to} onChange={(to) => setForm({ ...form, to })} />
      <Text style={styles.muted}>Giờ vàng (tùy chọn)</Text><TimeField label="Từ giờ" value={form.startTime} onChange={(startTime) => setForm({ ...form, startTime })} /><TimeField label="Đến giờ" value={form.endTime} onChange={(endTime) => setForm({ ...form, endTime })} />
      <Choice value={form.active ? "on" : "off"} onChange={(value) => setForm({ ...form, active: value === "on" })} options={[{ label: "Hoạt động", value: "on" }, { label: "Tạm ngừng", value: "off" }]} />
      <View style={styles.row}><Button title="Lưu mã" disabled={busy} onPress={() => void saveVoucher()} /><Button title="Đóng" secondary onPress={() => setEditing(null)} /></View>
    </Card>}
    <Text style={styles.subtitle}>Thông báo cho khách</Text>
    <Text style={styles.muted}>Thông báo được lưu trong app; thiết bị đã đăng ký token sẽ nhận push qua Expo. Hệ thống tạo nhắc lịch 1–2 giờ trước giờ hẹn.</Text>
    <Card><Text style={styles.muted}>Người nhận</Text><Choice value={target} onChange={setTarget} options={[{ label: "Tất cả khách", value: "" }, ...(customers.data || []).map((item) => ({ label: item.name, value: item.id }))]} />
      <Field label="Tiêu đề" value={title} onChange={setTitle} /><Field label="Nội dung" value={body} onChange={setBody} multiline />
      <Button title={busy ? "Đang gửi..." : "Gửi thông báo"} disabled={busy || title.trim().length < 2 || body.trim().length < 2} onPress={() => void send()} />
    </Card>
    <DataState loading={notifications.loading} error={notifications.error} retry={() => void notifications.reload()} />
    {notifications.data?.slice(0, 10).map((item) => <Card key={item.id}><Text style={styles.text}>{item.title}</Text><Text style={styles.muted}>{item.body}</Text><Text style={styles.muted}>{customers.data?.find((customer) => customer.id === item.customerId)?.name || item.customerId} · {item.read ? "Đã đọc" : "Chưa đọc"}</Text></Card>)}
    <ErrorText message={error} />{!!message && <Text style={{ color: colors.success }}>{message}</Text>}
  </View>;
}
