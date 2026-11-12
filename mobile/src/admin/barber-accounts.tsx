import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { api } from "../api";
import type { Barber, BarberAccount } from "../types";
import { Avatar, Button, Card, ComboBox, colors, ErrorText, Field, styles } from "../ui";
import { DangerConfirm, DataState, FormModal, useAdminList } from "./components";

type AccountForm = { barberId: string; phone: string; password: string };
const blank: AccountForm = { barberId: "", phone: "", password: "" };

export function BarberAccountsAdmin({ active, onChanged }: { active: boolean; onChanged: () => void }) {
  const accounts = useAdminList<BarberAccount[]>("/admin/barber-accounts", active);
  const barbers = useAdminList<Barber[]>("/admin/barbers", active);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<BarberAccount | "new" | null>(null);
  const [form, setForm] = useState<AccountForm>(blank);
  const [deleting, setDeleting] = useState<BarberAccount | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const assignedBarberIds = useMemo(() => new Set((accounts.data || []).map((item) => item.barberId)), [accounts.data]);
  const availableBarbers = (barbers.data || []).filter((item) => !assignedBarberIds.has(item.id));
  const visible = (accounts.data || []).filter((item) => `${item.barberName} ${item.phone}`.toLocaleLowerCase("vi-VN").includes(search.trim().toLocaleLowerCase("vi-VN")));

  function open(item: BarberAccount | "new") {
    setEditing(item);
    setError("");
    setSuccess("");
    setForm(item === "new" ? { ...blank, barberId: availableBarbers[0]?.id || "", phone: (barbers.data || []).find((barber) => barber.id === availableBarbers[0]?.id)?.phone || "" } : { barberId: item.barberId, phone: item.phone, password: "" });
  }

  async function save() {
    if (!editing || busy) return;
    const phone = form.phone.replace(/\D/g, "");
    const isNew = editing === "new";
    if (!/^0\d{9}$/.test(phone) || isNew && !form.barberId || isNew && form.password.length < 8 || form.password && form.password.length < 8) {
      setError(isNew ? "Chọn hồ sơ thợ, nhập số điện thoại 10 chữ số và mật khẩu ít nhất 8 ký tự." : "Nhập số điện thoại 10 chữ số; mật khẩu mới nếu có cần ít nhất 8 ký tự.");
      return;
    }
    setBusy(true); setError(""); setSuccess("");
    try {
      if (isNew) {
        await api("/admin/barber-accounts", { method: "POST", body: { barberId: form.barberId, phone, password: form.password } });
      } else {
        await api(`/admin/barber-accounts/${editing.id}`, { method: "PATCH", body: { phone, ...(form.password ? { password: form.password } : {}) } });
      }
      setEditing(null);
      setSuccess(isNew ? "Đã tạo tài khoản và liên kết với hồ sơ thợ." : "Đã cập nhật tài khoản đăng nhập.");
      await Promise.all([accounts.reload(), barbers.reload()]);
      onChanged();
    } catch (err: any) { setError(err.message || "Không lưu được tài khoản thợ."); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!deleting || busy) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      await api(`/admin/barber-accounts/${deleting.id}`, { method: "DELETE" });
      setDeleting(null);
      setSuccess("Đã xóa quyền đăng nhập. Hồ sơ thợ và lịch hẹn vẫn được giữ.");
      await Promise.all([accounts.reload(), barbers.reload()]);
      onChanged();
    } catch (err: any) { setError(err.message || "Không xóa được tài khoản thợ."); }
    finally { setBusy(false); }
  }

  return <View style={{ gap: 12 }}>
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
      <View style={{ flex: 1 }}><Text style={styles.subtitle}>Tài khoản thợ</Text><Text style={styles.muted}>Mỗi tài khoản được gắn với một hồ sơ thợ để đăng nhập vào luồng vận hành cá nhân.</Text></View>
      <Button title="Tạo tài khoản" disabled={!availableBarbers.length || barbers.loading || accounts.loading} onPress={() => open("new")} />
    </View>
    {!!success && <Text style={{ color: colors.success }}>{success}</Text>}
    <ErrorText message={!editing && !deleting ? error : ""} />
    <Field label="Tìm theo tên thợ hoặc số điện thoại" value={search} onChange={setSearch} />
    <View style={styles.row}><Button title="Làm mới" secondary disabled={accounts.loading || barbers.loading} onPress={() => { void accounts.reload(); void barbers.reload(); }} /><Text style={[styles.muted, { alignSelf: "center" }]}>{visible.length} tài khoản · {availableBarbers.length} thợ chưa có tài khoản</Text></View>
    <DataState loading={accounts.loading || barbers.loading} error={accounts.error || barbers.error} retry={() => { void accounts.reload(); void barbers.reload(); }} empty={!visible.length} />
    {!accounts.error && visible.map((account) => {
      const barber = barbers.data?.find((item) => item.id === account.barberId);
      return <Card key={account.id}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
          <Avatar name={account.barberName} uri={account.barberImageUrl || undefined} size={48} />
          <View style={{ flex: 1, minWidth: 0 }}><Text style={styles.subtitle}>{account.barberName}</Text><Text style={styles.muted}>{account.phone}</Text></View>
        </View>
        <Text style={styles.muted}>{barber?.title === "master" ? "Master Barber" : barber?.title === "top" ? "Top Stylist" : "Junior Stylist"} · {account.barberActive ? "Hồ sơ đang hoạt động" : "Hồ sơ đang tạm ngừng"}</Text>
        <View style={styles.row}><Button title="Sửa số / mật khẩu" secondary onPress={() => open(account)} /><Button title="Xóa tài khoản" secondary onPress={() => { setError(""); setDeleting(account); }} /></View>
      </Card>;
    })}

    <FormModal visible={!!editing} title={editing === "new" ? "Tạo tài khoản thợ" : `Sửa tài khoản · ${editing?.barberName || ""}`} onClose={() => { if (!busy) setEditing(null); }}>
      <ErrorText message={error} />
      {editing === "new"
        ? <ComboBox label="Hồ sơ thợ liên kết" value={form.barberId} onChange={(barberId) => setForm({ ...form, barberId, phone: (barbers.data || []).find((barber) => barber.id === barberId)?.phone || form.phone })} options={[...availableBarbers].sort((a, b) => a.name.localeCompare(b.name, "vi")).map((item) => ({ label: `${item.name}${item.active ? "" : " · Tạm ngừng"}`, value: item.id }))} />
        : <Card style={{ padding: 12 }}><Text style={styles.text}>Đang liên kết với {editing?.barberName}</Text><Text style={styles.muted}>Tài khoản sẽ dùng hồ sơ này cho lịch hẹn, ca làm và tin nhắn.</Text></Card>}
      <Field label="Số điện thoại đăng nhập" value={form.phone} onChange={(phone) => setForm({ ...form, phone })} numeric />
      <Field label={editing === "new" ? "Mật khẩu ban đầu (ít nhất 8 ký tự)" : "Mật khẩu mới (để trống nếu không đổi)"} value={form.password} onChange={(password) => setForm({ ...form, password })} secure />
      <Button title={busy ? "Đang lưu…" : editing === "new" ? "Tạo và liên kết" : "Lưu thay đổi"} disabled={busy} onPress={() => void save()} />
    </FormModal>
    <DangerConfirm title="Xóa tài khoản đăng nhập" message={`Xóa quyền đăng nhập của ${deleting?.barberName || "thợ này"}. Hồ sơ thợ, lịch làm và lịch hẹn được giữ nguyên; bạn có thể tạo lại tài khoản sau.`} visible={!!deleting} onClose={() => { if (!busy) setDeleting(null); }} onConfirm={() => void remove()} busy={busy} />
  </View>;
}
