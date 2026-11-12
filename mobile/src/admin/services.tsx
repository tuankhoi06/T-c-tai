import React, { useState } from "react";
import { Image, Text, View } from "react-native";
import { api } from "../api";
import type { HairService } from "../types";
import { Button, Card, ComboBox, ErrorText, Field, money, styles, colors } from "../ui";
import { Choice, DangerConfirm, DataState, FormModal, useAdminList } from "./components";
import { servicePhoto } from "../visuals";

const categories = [{ label: "Cắt", value: "cut" }, { label: "Gội · Massage", value: "wash" }, { label: "Uốn · Nhuộm", value: "chemical" }, { label: "Chăm sóc", value: "care" }, { label: "Combo", value: "combo" }];
const blank = { name: "", description: "", price: "100000", durationMinutes: "30", category: "cut", process: "", imageUrl: "", promotionPrice: "" };
export function ServicesAdmin({ active, onChanged }: { active: boolean; onChanged: () => void }) {
  const list = useAdminList<HairService[]>("/admin/services", active);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortBy, setSortBy] = useState("name");
  const [editing, setEditing] = useState<HairService | "new" | null>(null);
  const [form, setForm] = useState(blank);
  const [target, setTarget] = useState<HairService | null>(null);
  const [deleting, setDeleting] = useState<HairService | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  function open(item: HairService | "new") {
    setEditing(item); setError("");
    setForm(item === "new" ? blank : { name: item.name, description: item.description, price: String(item.price), durationMinutes: String(item.durationMinutes), category: item.category || "cut", process: item.process || "", imageUrl: item.imageUrl || "", promotionPrice: item.promotionPrice == null ? "" : String(item.promotionPrice) });
  }
  async function save() {
    if (!editing || busy) return;
    const price = Number(form.price), durationMinutes = Number(form.durationMinutes);
    if (!form.name.trim() || !Number.isInteger(price) || price < 0 || !Number.isInteger(durationMinutes) || durationMinutes < 15) { setError("Nhập tên, giá và thời lượng hợp lệ (tối thiểu 15 phút)."); return; }
    const promotionPrice = form.promotionPrice.trim() ? Number(form.promotionPrice) : null;
    if (promotionPrice !== null && (!Number.isInteger(promotionPrice) || promotionPrice < 0 || promotionPrice > price)) { setError("Giá khuyến mãi phải từ 0 đến giá gốc."); return; }
    setBusy(true); setError(""); setSuccess("");
    try {
      const isNew = editing === "new";
      await api(isNew ? "/admin/services" : `/admin/services/${editing.id}`, { method: isNew ? "POST" : "PATCH", body: { name: form.name.trim(), description: form.description.trim(), price, durationMinutes, category: form.category, process: form.process.trim(), imageUrl: form.imageUrl.trim(), promotionPrice, ...(isNew ? { active: true } : {}) } });
      setEditing(null); setSuccess(isNew ? "Đã thêm dịch vụ." : "Đã cập nhật dịch vụ. Lịch cũ giữ nguyên giá và thời lượng đã đặt.");
      await list.reload(); onChanged();
    } catch (err: any) { setError(err.message || "Không lưu được dịch vụ."); }
    finally { setBusy(false); }
  }
  async function toggle() {
    if (!target || busy) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      await api(`/admin/services/${target.id}`, { method: "PATCH", body: { active: !target.active } });
      setTarget(null); setSuccess(target.active ? "Đã tạm ngừng dịch vụ. Lịch cũ được giữ nguyên." : "Đã kích hoạt lại dịch vụ.");
      await list.reload(); onChanged();
    } catch (err: any) { setError(err.message || "Không đổi được trạng thái dịch vụ."); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!deleting || busy) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      await api(`/admin/services/${deleting.id}?permanent=true`, { method: "DELETE" });
      setDeleting(null); setSuccess("Đã xóa dịch vụ."); await list.reload(); onChanged();
    } catch (err: any) { setDeleting(null); setError(err.message || "Không xóa được dịch vụ."); }
    finally { setBusy(false); }
  }
  const visible = (list.data || []).filter((item) => (filter === "all" || item.active === (filter === "active")) && (categoryFilter === "all" || item.category === categoryFilter) && `${item.name} ${item.description}`.toLocaleLowerCase("vi-VN").includes(search.trim().toLocaleLowerCase("vi-VN")))
    .sort((a, b) => sortBy === "price-asc" ? (a.promotionPrice ?? a.price) - (b.promotionPrice ?? b.price) :
      sortBy === "price-desc" ? (b.promotionPrice ?? b.price) - (a.promotionPrice ?? a.price) :
        sortBy === "duration" ? a.durationMinutes - b.durationMinutes : a.name.localeCompare(b.name, "vi"));
  return <View style={{ gap: 12 }}>
    <Text style={styles.subtitle}>Dịch vụ</Text><View style={styles.row}><Button title="Thêm dịch vụ" onPress={() => open("new")} /><Button title="Làm mới" secondary disabled={list.loading} onPress={() => void list.reload()} /></View>
    {!!success && <Text style={{ color: colors.success }}>{success}</Text>}<ErrorText message={!editing && !target ? error : ""} />
    <Field label="Tìm dịch vụ" value={search} onChange={setSearch} />
    <Choice value={filter} onChange={setFilter} options={[{ label: "Tất cả", value: "all" }, { label: "Đang hoạt động", value: "active" }, { label: "Tạm ngừng", value: "inactive" }]} />
    <ComboBox label="Danh mục" value={categoryFilter} onChange={setCategoryFilter} options={[{ label: "Mọi danh mục", value: "all" }, ...categories]} />
    <ComboBox label="Sắp xếp" value={sortBy} onChange={setSortBy} options={[{ label: "Tên A–Z", value: "name" }, { label: "Giá thấp", value: "price-asc" }, { label: "Giá cao", value: "price-desc" }, { label: "Thời lượng ngắn", value: "duration" }]} />
    <DataState loading={list.loading} error={list.error} retry={() => void list.reload()} empty={visible.length === 0} />
    {!list.error && visible.map((item) => <Card key={item.id} style={{ padding: 12, gap: 8 }}>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <Image source={item.imageUrl ? { uri: item.imageUrl } : servicePhoto(item.name)} style={{ width: 84, height: 84, borderRadius: 12 }} resizeMode="cover" />
        <View style={{ flex: 1, gap: 3 }}><Text style={[styles.muted, { fontSize: 11 }]}>{categories.find((entry) => entry.value === item.category)?.label || "Dịch vụ"} · {item.durationMinutes} phút</Text>
          <Text style={[styles.text, { fontWeight: "700" }]}>{item.name}</Text><Text style={{ color: colors.gold, fontWeight: "700" }}>{money(item.promotionPrice ?? item.price)}{item.promotionPrice != null ? `  ·  ${money(item.price)} gốc` : ""}</Text>
          <Text style={[styles.muted, { fontSize: 12 }]}>{item.active ? "Đang hoạt động" : "Tạm ngừng"}{item.futureAppointmentCount ? ` · ${item.futureAppointmentCount} lịch sắp tới` : ""}</Text>
        </View>
      </View>
      <Text style={styles.muted} numberOfLines={2}>{item.description}</Text>
      <View style={styles.row}><Button title="Sửa" secondary onPress={() => open(item)} /><Button title={item.active ? "Tạm ngừng" : "Kích hoạt lại"} secondary onPress={() => { setError(""); setTarget(item); }} /><Button title="Xóa" secondary onPress={() => { setError(""); setDeleting(item); }} /></View>
    </Card>)}
    <FormModal title={editing === "new" ? "Thêm dịch vụ" : "Sửa dịch vụ"} visible={!!editing} onClose={() => { if (!busy) setEditing(null); }}>
      <ErrorText message={error} /><Field label="Tên dịch vụ" value={form.name} onChange={(name) => setForm({ ...form, name })} />
      <Field label="Mô tả" value={form.description} onChange={(description) => setForm({ ...form, description })} multiline />
      <Text style={styles.muted}>Danh mục</Text><Choice value={form.category} onChange={(category) => setForm({ ...form, category })} options={categories} />
      <Field label="Quy trình" value={form.process} onChange={(process) => setForm({ ...form, process })} multiline />
      <Field label="URL ảnh minh họa (nếu có)" value={form.imageUrl} onChange={(imageUrl) => setForm({ ...form, imageUrl })} />
      <Field label="Giá (VNĐ)" value={form.price} onChange={(price) => setForm({ ...form, price })} numeric />
      <Field label="Giá khuyến mãi (để trống nếu không có)" value={form.promotionPrice} onChange={(promotionPrice) => setForm({ ...form, promotionPrice })} numeric />
      <Field label="Thời lượng (phút)" value={form.durationMinutes} onChange={(durationMinutes) => setForm({ ...form, durationMinutes })} numeric />
      <Button title={busy ? "Đang lưu..." : "Lưu"} disabled={busy} onPress={() => void save()} />
    </FormModal>
    <DangerConfirm title={target?.active ? "Tạm ngừng dịch vụ" : "Kích hoạt lại dịch vụ"} message={target?.active ? `Dịch vụ còn ${target.futureAppointmentCount || 0} lịch sắp tới. Các lịch này vẫn được giữ nguyên.` : "Dịch vụ sẽ xuất hiện lại cho khách đặt lịch."} visible={!!target} onClose={() => setTarget(null)} onConfirm={() => void toggle()} busy={busy} />
    <DangerConfirm title="Xóa dịch vụ" message="Chỉ xóa được dịch vụ chưa từng có lịch hẹn. Nếu đã có lịch, hãy tạm ngừng để giữ lịch sử." visible={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => void remove()} busy={busy} />
  </View>;
}
