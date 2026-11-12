import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api } from "./api";
import type { Barber, User } from "./types";
import { Button, DragScrollView, Page, ShopClock, styles, colors } from "./ui";
import { Choice, DataState, useAdminList } from "./admin/components";
import { DashboardAdmin } from "./admin/dashboard";
import { ServicesAdmin } from "./admin/services";
import { BarbersAdmin } from "./admin/barbers";
import { SchedulesAdmin } from "./admin/schedules";
import { CustomersAdmin } from "./admin/customers";
import { MarketingAdmin } from "./admin/marketing";
import { ReportsAdmin } from "./admin/reports";
import { SupportAdmin } from "./admin/support";
import { BarberAccountsAdmin } from "./admin/barber-accounts";
import { AppointmentsAdmin } from "./admin/appointments";

type Tab = "dashboard" | "appointments" | "services" | "barbers" | "barberAccounts" | "schedules" | "customers" | "marketing" | "reports" | "support";
const groups: { label: string; items: { label: string; value: Tab }[] }[] = [
  { label: "ĐIỀU HÀNH", items: [{ label: "Tổng quan", value: "dashboard" }, { label: "Hòm thư", value: "support" }, { label: "Lịch hẹn", value: "appointments" }] },
  { label: "SALON", items: [{ label: "Dịch vụ", value: "services" }, { label: "Thợ", value: "barbers" }, { label: "Tài khoản thợ", value: "barberAccounts" }, { label: "Ca làm", value: "schedules" }, { label: "Khách hàng", value: "customers" }] },
  { label: "KINH DOANH", items: [{ label: "Ưu đãi", value: "marketing" }, { label: "Báo cáo", value: "reports" }] }
];
const tabLabel = Object.fromEntries(groups.flatMap((group) => group.items.map((item) => [item.value, item.label]))) as Record<Tab, string>;
export function Admin({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [refreshKey, setRefreshKey] = useState(0);
  const [schedulePreset, setSchedulePreset] = useState({ id: 0, barberId: "" });
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [pendingLeaves, setPendingLeaves] = useState(0);
  const barbers = useAdminList<Barber[]>("/admin/barbers");
  const selectedGroup = groups.find((group) => group.items.some((item) => item.value === tab)) || groups[0];
  useEffect(() => {
    let live = true;
    const refreshUnread = async () => {
      try { const result = await api<{ count: number; pendingLeaveCount?: number }>("/messages/unread-count"); if (live) { setUnreadMessages(result.count); setPendingLeaves(result.pendingLeaveCount || 0); } }
      catch { if (live) { setUnreadMessages(0); setPendingLeaves(0); } }
    };
    void refreshUnread();
    const timer = setInterval(() => void refreshUnread(), 12000);
    return () => { live = false; clearInterval(timer); };
  }, []);
  async function markMessagesRead() {
    try {
      const result = await api<{ count: number; pendingLeaveCount?: number }>("/messages/read-all", { method: "POST" });
      setUnreadMessages(result.count);
      if (result.pendingLeaveCount !== undefined) setPendingLeaves(result.pendingLeaveCount);
    } catch { /* Keep the alert visible if marking read fails. */ }
  }
  function changed() { setRefreshKey((value) => value + 1); }
  function openSchedules(barberId: string) { setSchedulePreset((value) => ({ id: value.id + 1, barberId })); setTab("schedules"); }
  return <Page key={tab}><View style={{ width: "100%", maxWidth: 960, alignSelf: "center", gap: 12 }}>
    <View style={[styles.card, { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingVertical: 12 }]}>
      <View style={{ flex: 1 }}><Text style={[styles.muted, { fontSize: 11, letterSpacing: 1.2, fontWeight: "700" }]}>HAIRMATCH · QUẢN TRỊ</Text><Text style={[styles.subtitle, { color: colors.text }]}>Xin chào, {user.name}</Text><ShopClock label="Đồng hồ máy" /></View>
      <Button title="Đăng xuất" secondary onPress={onLogout} />
    </View>
    <View style={{ flexDirection: "row", gap: 7 }}>{groups.map((group) => {
      const selected = group === selectedGroup;
      return <Pressable key={group.label} accessibilityRole="button" onPress={() => setTab(group.items[0].value)} style={[styles.button, selected ? null : styles.buttonSecondary, { minHeight: 44, paddingVertical: 9, paddingHorizontal: 12 }]}><Text style={[styles.buttonText, !selected && { color: colors.text }, { fontSize: 12 }]}>{group.label}</Text></Pressable>;
    })}</View>
    <DragScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 3 }}>
      {selectedGroup.items.map((item) => <Pressable key={item.value} accessibilityRole="button" onPress={() => setTab(item.value)} style={[styles.card, { minHeight: 44, justifyContent: "center", paddingVertical: 8, paddingHorizontal: 13, borderRadius: 999 }, tab === item.value && { backgroundColor: colors.cream, borderColor: colors.gold }]}><Text style={[styles.text, tab === item.value && { color: colors.dark }, { fontSize: 13, fontWeight: tab === item.value ? "700" : "500" }]}>{item.label}</Text></Pressable>)}
    </DragScrollView>
    <Text style={[styles.muted, { fontSize: 12 }]}>{selectedGroup.label} / {tabLabel[tab]}</Text>
    {(unreadMessages > 0 || pendingLeaves > 0) && <View style={[styles.card, { borderColor: colors.danger, paddingVertical: 10, gap: 8 }]}>
      <Pressable accessibilityRole="button" onPress={() => setTab("support")}><Text style={{ color: colors.danger, fontWeight: "800" }}>✉ {[unreadMessages > 0 ? `${unreadMessages} cuộc trò chuyện chưa đọc` : "", pendingLeaves > 0 ? `${pendingLeaves} đơn xin nghỉ cần duyệt` : ""].filter(Boolean).join(" · ")} · Mở hòm thư</Text></Pressable>
      {unreadMessages > 0 && <Button title="Đánh dấu tin nhắn đã đọc" secondary onPress={() => void markMessagesRead()} />}
    </View>}
    <DataState loading={barbers.loading} error={barbers.error} retry={() => void barbers.reload()} />
    {tab === "dashboard" && <DashboardAdmin active refreshKey={refreshKey} />}
    {tab === "services" && <ServicesAdmin active onChanged={changed} />}
    {tab === "barbers" && <BarbersAdmin active onChanged={() => { changed(); void barbers.reload(); }} showSchedules={openSchedules} />}
    {tab === "barberAccounts" && <BarberAccountsAdmin active onChanged={() => { changed(); void barbers.reload(); }} />}
    {tab === "schedules" && <SchedulesAdmin active barbers={barbers.data || []} preset={schedulePreset} />}
    {tab === "appointments" && <AppointmentsAdmin active barbers={barbers.data || []} preset={{ id: 0, filter: {} }} onChanged={changed} />}
    {tab === "customers" && <CustomersAdmin />}
    {tab === "marketing" && <MarketingAdmin active />}
    {tab === "reports" && <ReportsAdmin active />}
    {tab === "support" && <SupportAdmin active viewerId={user.id} />}
  </View></Page>;
}
