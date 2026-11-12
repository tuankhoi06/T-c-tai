import React, { useState } from "react";
import { Text, View } from "react-native";
import { api } from "../api";
import type { AdminReport, Barber, HairService } from "../types";
import { Avatar, Button, Card, colors, ErrorText, Field, money, shopDate, styles } from "../ui";
import { Choice, DangerConfirm, DataState, FormModal, useAdminList } from "./components";
import { StaffLeaveManagement } from "./staff_leaves";

export function BarbersAdmin({ active, onChanged, showSchedules }: { active: boolean; onChanged: () => void; showSchedules: (id: string) => void }) {
  const list = useAdminList<Barber[]>("/admin/barbers", active);
  const services = useAdminList<HairService[]>("/admin/services", active);
  const reports = useAdminList<AdminReport>(`/admin/reports?from=${shopDate().slice(0, 7)}-01&to=${shopDate()}`, active);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [titleFilter, setTitleFilter] = useState("all");
  const [sortBy, setSortBy] = useState("name");
  const [showLeaves, setShowLeaves] = useState(false);
  const [editing, setEditing] = useState<Barber | "new" | null>(null);
  const [form, setForm] = useState({ name: "", bio: "", imageUrl: "", phone: "", title: "junior", commissionRate: "0", serviceIds: [] as string[], allServices: true });
  const [target, setTarget] = useState<Barber | null>(null);
  const [deleting, setDeleting] = useState<Barber | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  function open(item: Barber | "new") { setEditing(item); setError(""); setForm(item === "new" ? { name: "", bio: "", imageUrl: "", phone: "", title: "junior", commissionRate: "0", serviceIds: [], allServices: true } : { name: item.name, bio: item.bio, imageUrl: item.imageUrl, phone: item.phone || "", title: item.title || "junior", commissionRate: String(item.commissionRate || 0), serviceIds: item.serviceIds || [], allServices: !item.serviceIds }); }
  async function save() {
    if (!editing || busy) return;
    if (!form.name.trim()) { setError("Cần nhập tên thợ."); return; }
    if (form.imageUrl.trim() && !/^https?:\/\/\S+$/i.test(form.imageUrl.trim())) { setError("URL ảnh phải bắt đầu bằng http:// hoặc https://."); return; }
    const commissionRate = Number(form.commissionRate);
    if ((form.phone.trim() && !/^\d{9,15}$/.test(form.phone.trim())) || !Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 100) { setError("Số điện thoại hoặc tỷ lệ hoa hồng không hợp lệ."); return; }
    setBusy(true); setError(""); setSuccess("");
    try {
      const isNew = editing === "new";
      await api(isNew ? "/admin/barbers" : `/admin/barbers/${editing.id}`, { method: isNew ? "POST" : "PATCH", body: { name: form.name.trim(), bio: form.bio.trim(), imageUrl: form.imageUrl.trim(), phone: form.phone.trim(), title: form.title, commissionRate, serviceIds: form.allServices ? null : form.serviceIds, ...(isNew ? { active: true } : {}) } });
      setEditing(null); setSuccess(isNew ? "Đã thêm thợ." : "Đã cập nhật thợ."); await list.reload(); onChanged();
    } catch (err: any) { setError(err.message || "Không lưu được thợ."); }
    finally { setBusy(false); }
  }
  async function toggle() {
    if (!target || busy) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      await api(`/admin/barbers/${target.id}`, { method: "PATCH", body: { active: !target.active } });
      setTarget(null); setSuccess(target.active ? "Đã tạm ngừng thợ. Lịch cũ được giữ nguyên." : "Đã kích hoạt lại thợ."); await list.reload(); onChanged();
    } catch (err: any) { setError(err.message || "Không đổi được trạng thái thợ."); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!deleting || busy) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      await api(`/admin/barbers/${deleting.id}?permanent=true`, { method: "DELETE" });
      setDeleting(null); setSuccess("Đã xóa thợ và các ca làm việc của thợ."); await list.reload(); onChanged();
    } catch (err: any) { setDeleting(null); setError(err.message || "Không xóa được thợ."); }
    finally { setBusy(false); }
  }
  const needle = search.trim().toLocaleLowerCase("vi-VN");
  const visible = (list.data || []).filter((item) => (filter === "all" || item.active === (filter === "active")) &&
    (titleFilter === "all" || item.title === titleFilter) &&
    `${item.name} ${item.bio} ${item.phone || ""}`.toLocaleLowerCase("vi-VN").includes(needle))
    .sort((a, b) => {
      const aReport = reports.data?.byBarber.find((entry) => entry.barberId === a.id);
      const bReport = reports.data?.byBarber.find((entry) => entry.barberId === b.id);
      if (sortBy === "revenue") return (bReport?.revenue || 0) - (aReport?.revenue || 0);
      if (sortBy === "rating") return (bReport?.ratingAverage || 0) - (aReport?.ratingAverage || 0);
      if (sortBy === "appointments") return (bReport?.count || 0) - (aReport?.count || 0);
      return a.name.localeCompare(b.name, "vi");
    });
  return <View style={{ gap: 12 }}>
    <Text style={styles.subtitle}>Thợ tóc</Text><View style={styles.row}><Button title="Thêm thợ" onPress={() => open("new")} /><Button title="Làm mới" secondary disabled={list.loading} onPress={() => void list.reload()} /></View>
    {!!success && <Text style={{ color: colors.success }}>{success}</Text>}<ErrorText message={!editing && !target ? error : ""} />
    <Field label="Tìm thợ" value={search} onChange={setSearch} />
    <Choice value={filter} onChange={setFilter} options={[{ label: "Tất cả", value: "all" }, { label: "Đang hoạt động", value: "active" }, { label: "Tạm ngừng", value: "inactive" }]} />
    <Text style={styles.muted}>Chức danh</Text><Choice value={titleFilter} onChange={setTitleFilter} options={[{ label: "Tất cả", value: "all" }, { label: "Master", value: "master" }, { label: "Top Stylist", value: "top" }, { label: "Junior", value: "junior" }]} />
    <Text style={styles.muted}>Sắp xếp</Text><Choice value={sortBy} onChange={setSortBy} options={[{ label: "Tên A–Z", value: "name" }, { label: "Doanh thu", value: "revenue" }, { label: "Số lượt", value: "appointments" }, { label: "Đánh giá", value: "rating" }]} />
    <Button title={showLeaves ? "Ẩn quản lý nghỉ phép" : "Quản lý nghỉ phép"} secondary onPress={() => setShowLeaves((value) => !value)} />
    {showLeaves && <StaffLeaveManagement active={active} barbers={list.data || []} onChanged={() => { void list.reload(); onChanged(); }} />}
    <DataState loading={list.loading} error={list.error} retry={() => void list.reload()} empty={visible.length === 0} />
    {!list.error && visible.map((item) => <Card key={item.id}>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}><Avatar name={item.name} uri={item.imageUrl || undefined} size={54} /><View style={{ flex: 1 }}><Text style={styles.subtitle}>{item.name}</Text><Text style={styles.muted}>{item.title === "master" ? "Master Barber" : item.title === "top" ? "Top Stylist" : "Junior Stylist"}{item.phone ? ` · ${item.phone}` : ""}</Text></View></View><Text style={styles.muted}>{item.bio}</Text>
      <Text style={styles.muted}>{item.accountPhone ? `Tài khoản đăng nhập: ${item.accountPhone}` : "Chưa có tài khoản đăng nhập cho thợ này."}</Text>
      <Text style={styles.muted}>Dịch vụ: {item.serviceIds ? item.serviceIds.map((id) => services.data?.find((service) => service.id === id)?.name || id).join(", ") || "Chưa gán" : "Tất cả"}</Text>
      {(() => { const row = reports.data?.byBarber.find((entry) => entry.barberId === item.id); return row ? <Text style={styles.muted}>Tháng này: {row.count} lượt · {money(row.revenue)} · Hoa hồng {money(row.commission)} · {row.ratingAverage == null ? "Chưa có đánh giá" : `★ ${row.ratingAverage}/5`}</Text> : null; })()}
      <Text style={styles.text}>{item.active ? "Đang hoạt động" : "Tạm ngừng"}</Text>
      {!!item.futureAppointmentCount && <Text style={styles.muted}>{item.futureAppointmentCount} lịch sắp tới đang hiệu lực</Text>}
      <View style={styles.row}><Button title="Sửa" secondary onPress={() => open(item)} /><Button title={item.active ? "Tạm ngừng" : "Kích hoạt lại"} secondary onPress={() => { setError(""); setTarget(item); }} /><Button title="Xóa" secondary onPress={() => { setError(""); setDeleting(item); }} /></View>
      <Button title="Xem lịch làm việc" secondary onPress={() => showSchedules(item.id)} />
    </Card>)}
    <FormModal title={editing === "new" ? "Thêm thợ" : "Sửa thợ"} visible={!!editing} onClose={() => { if (!busy) setEditing(null); }}>
      <ErrorText message={error} /><Field label="Tên thợ" value={form.name} onChange={(name) => setForm({ ...form, name })} />
      <Field label="Giới thiệu" value={form.bio} onChange={(bio) => setForm({ ...form, bio })} multiline />
      <Field label="Số điện thoại" value={form.phone} onChange={(phone) => setForm({ ...form, phone })} numeric />
      <Text style={styles.muted}>Chức danh</Text><Choice value={form.title} onChange={(title) => setForm({ ...form, title })} options={[{ label: "Master", value: "master" }, { label: "Top Stylist", value: "top" }, { label: "Junior", value: "junior" }]} />
      <Field label="Hoa hồng (%)" value={form.commissionRate} onChange={(commissionRate) => setForm({ ...form, commissionRate })} numeric />
      <Text style={styles.muted}>Dịch vụ có thể thực hiện</Text><Choice value={form.allServices ? "all" : "selected"} onChange={(value) => setForm({ ...form, allServices: value === "all" })} options={[{ label: "Tất cả", value: "all" }, { label: "Chọn riêng", value: "selected" }]} />
      {!form.allServices && <View style={styles.row}>{services.data?.map((service) => <Button key={service.id} title={service.name} secondary={!form.serviceIds.includes(service.id)} onPress={() => setForm({ ...form, serviceIds: form.serviceIds.includes(service.id) ? form.serviceIds.filter((id) => id !== service.id) : [...form.serviceIds, service.id] })} />)}</View>}
      <Field label="URL ảnh đại diện (có thể để trống)" value={form.imageUrl} onChange={(imageUrl) => setForm({ ...form, imageUrl })} />
      <Button title={busy ? "Đang lưu..." : "Lưu"} disabled={busy} onPress={() => void save()} />
    </FormModal>
    <DangerConfirm title={target?.active ? "Tạm ngừng thợ" : "Kích hoạt lại thợ"} message={target?.active ? `Thợ còn ${target.futureAppointmentCount || 0} lịch sắp tới. Các lịch này vẫn được giữ nguyên.` : "Thợ sẽ xuất hiện lại cho khách đặt lịch."} visible={!!target} onClose={() => setTarget(null)} onConfirm={() => void toggle()} busy={busy} />
    <DangerConfirm title="Xóa thợ" message="Chỉ xóa được thợ chưa từng có lịch hẹn. Các ca làm việc của thợ sẽ bị xóa cùng." visible={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => void remove()} busy={busy} />
  </View>;
}
