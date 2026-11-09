import React, { useState } from "react";
import { Text, View } from "react-native";
import { api } from "../api";
import type { User } from "../types";
import { Button, Card, colors, ErrorText, Field, shopDate, styles } from "../ui";
import { Choice, DangerConfirm, DataState, DateField, FormModal, useAdminList } from "./components";

const blank = { name: "", phone: "", email: "", password: "", tier: "silver", internalNote: "", blacklisted: false };

export function CustomersAdmin() {
  const list = useAdminList<User[]>("/admin/customers");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const [form, setForm] = useState(blank);
  const [deleting, setDeleting] = useState<User | null>(null);
  const [historyCustomer, setHistoryCustomer] = useState<User | null>(null);
  const [record, setRecord] = useState({ date: shopDate(), style: "", color: "", formula: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function open(item: User | "new") {
    setEditing(item); setError("");
    setForm(item === "new" ? blank : { name: item.name, phone: item.phone || "", email: item.email || "", password: "", tier: item.tier || "silver", internalNote: item.internalNote || "", blacklisted: !!item.blacklisted });
  }

  async function save() {
    if (!editing || busy) return;
    const name = form.name.trim(), phone = form.phone.trim(), email = form.email.trim();
    if (name.length < 2 || (!phone && !email) || (phone && !/^\d{9,15}$/.test(phone)) || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || (editing === "new" && form.password.length < 8)) {
      setError("Nhập tên từ 2 ký tự, số điện thoại hoặc email hợp lệ; mật khẩu mới từ 8 ký tự."); return;
    }
    setBusy(true); setError(""); setSuccess("");
    try {
      const isNew = editing === "new";
      await api(isNew ? "/admin/customers" : `/admin/customers/${editing.id}`, {
        method: isNew ? "POST" : "PATCH",
        body: { name, phone, email, tier: form.tier, internalNote: form.internalNote.trim(), blacklisted: form.blacklisted, ...(isNew ? { password: form.password } : {}) }
      });
      setEditing(null); setSuccess(isNew ? "Đã thêm khách hàng." : "Đã cập nhật khách hàng."); await list.reload();
    } catch (err: any) { setError(err.message || "Không lưu được khách hàng."); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!deleting || busy) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      await api(`/admin/customers/${deleting.id}`, { method: "DELETE" });
      setDeleting(null); setSuccess("Đã xóa khách hàng."); await list.reload();
    } catch (err: any) { setDeleting(null); setError(err.message || "Không xóa được khách hàng."); }
    finally { setBusy(false); }
  }
  async function addRecord() {
    if (!historyCustomer || busy || !record.style.trim()) return;
    setBusy(true); setError("");
    try {
      await api(`/admin/customers/${historyCustomer.id}`, { method: "PATCH", body: { hairHistory: [...(historyCustomer.hairHistory || []), { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, date: record.date, style: record.style.trim(), color: record.color.trim(), formula: record.formula.trim(), note: record.note.trim() }] } });
      setHistoryCustomer(null); setRecord({ date: shopDate(), style: "", color: "", formula: "", note: "" }); setSuccess("Đã lưu lịch sử tóc."); await list.reload();
    } catch (err: any) { setError(err.message || "Không lưu được lịch sử tóc."); }
    finally { setBusy(false); }
  }

  const query = search.trim().toLocaleLowerCase("vi-VN");
  const visible = (list.data || []).filter((item) => [item.name, item.phone || "", item.email || ""].some((value) => value.toLocaleLowerCase("vi-VN").includes(query)));
  return <View style={{ gap: 12 }}>
    <Text style={styles.subtitle}>Khách hàng</Text>
    <View style={styles.row}><Button title="Thêm khách" onPress={() => open("new")} /><Button title="Làm mới" secondary disabled={list.loading} onPress={() => void list.reload()} /></View>
    {!!success && <Text style={{ color: colors.success }}>{success}</Text>}<ErrorText message={!editing && !deleting ? error : ""} />
    <Field label="Tìm tên, số điện thoại hoặc email" value={search} onChange={setSearch} />
    <DataState loading={list.loading} error={list.error} retry={() => void list.reload()} empty={visible.length === 0} />
    {!list.error && visible.map((item) => <Card key={item.id}>
      <Text style={styles.subtitle}>{item.name}</Text>
      <Text style={styles.muted}>{[item.phone, item.email].filter(Boolean).join(" · ")}</Text>
      <Text style={styles.muted}>Hạng {item.tier === "vip" ? "VIP" : item.tier === "gold" ? "Vàng" : "Bạc"}{item.blacklisted ? " · Đã chặn đặt lịch" : ""}</Text>
      {!!item.internalNote && <Text style={styles.muted}>Ghi chú nội bộ: {item.internalNote}</Text>}
      {!!item.hairHistory?.length && <View style={{ gap: 4 }}><Text style={styles.text}>Lịch sử làm tóc</Text>{item.hairHistory.map((entry) => <Text key={entry.id} style={styles.muted}>{entry.date} · {entry.style}{entry.color ? ` · Màu ${entry.color}` : ""}{entry.formula ? ` · Công thức ${entry.formula}` : ""}{entry.note ? ` · ${entry.note}` : ""}</Text>)}</View>}
      <View style={styles.row}><Button title="Sửa hồ sơ" secondary onPress={() => open(item)} /><Button title="Thêm lịch sử tóc" secondary onPress={() => { setHistoryCustomer(item); setError(""); }} /><Button title="Xóa" secondary onPress={() => { setError(""); setDeleting(item); }} /></View>
    </Card>)}
    <FormModal visible={!!editing} title={editing === "new" ? "Thêm khách hàng" : "Sửa khách hàng"} onClose={() => { if (!busy) setEditing(null); }}>
      <ErrorText message={error} />
      <Field label="Tên khách" value={form.name} onChange={(name) => setForm({ ...form, name })} />
      <Field label="Số điện thoại" value={form.phone} onChange={(phone) => setForm({ ...form, phone })} numeric />
      <Field label="Email" value={form.email} onChange={(email) => setForm({ ...form, email })} />
      <Text style={styles.muted}>Hạng thành viên</Text><Choice value={form.tier} onChange={(tier) => setForm({ ...form, tier })} options={[{ label: "Bạc", value: "silver" }, { label: "Vàng", value: "gold" }, { label: "VIP", value: "vip" }]} />
      <Field label="Ghi chú nội bộ" value={form.internalNote} onChange={(internalNote) => setForm({ ...form, internalNote })} multiline />
      <Text style={styles.muted}>Đặt lịch</Text><Choice value={form.blacklisted ? "blocked" : "normal"} onChange={(value) => setForm({ ...form, blacklisted: value === "blocked" })} options={[{ label: "Bình thường", value: "normal" }, { label: "Chặn đặt lịch", value: "blocked" }]} />
      {editing === "new" && <Field label="Mật khẩu (ít nhất 8 ký tự)" value={form.password} onChange={(password) => setForm({ ...form, password })} secure />}
      <Button title={busy ? "Đang lưu..." : "Lưu khách"} disabled={busy} onPress={() => void save()} />
    </FormModal>
    <FormModal visible={!!historyCustomer} title={`Lịch sử tóc · ${historyCustomer?.name || ""}`} onClose={() => { if (!busy) setHistoryCustomer(null); }}>
      <ErrorText message={error} /><DateField label="Ngày thực hiện" value={record.date} onChange={(date) => setRecord({ ...record, date })} />
      <Field label="Kiểu tóc" value={record.style} onChange={(style) => setRecord({ ...record, style })} />
      <Field label="Mã màu / màu nhuộm" value={record.color} onChange={(color) => setRecord({ ...record, color })} />
      <Field label="Công thức thuốc" value={record.formula} onChange={(formula) => setRecord({ ...record, formula })} multiline />
      <Field label="Ghi chú" value={record.note} onChange={(note) => setRecord({ ...record, note })} multiline />
      <Button title="Lưu lịch sử" disabled={busy || !record.style.trim()} onPress={() => void addRecord()} />
    </FormModal>
    <DangerConfirm title="Xóa khách hàng" message="Chỉ xóa được tài khoản chưa có lịch hẹn hoặc lịch sử tóc. Dữ liệu lịch sử được giữ nguyên." visible={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => void remove()} busy={busy} />
  </View>;
}
