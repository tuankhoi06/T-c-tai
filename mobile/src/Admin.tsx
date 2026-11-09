import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { Barber, User } from "./types";
import { Button, Page, ShopClock, styles, colors } from "./ui";
import { Choice, DataState, useAdminList } from "./admin/components";
import { DashboardAdmin } from "./admin/dashboard";
import { AppointmentsAdmin, type AppointmentFilter } from "./admin/appointments";
import { ServicesAdmin } from "./admin/services";
import { BarbersAdmin } from "./admin/barbers";
import { SchedulesAdmin } from "./admin/schedules";
import { CustomersAdmin } from "./admin/customers";
import { MarketingAdmin } from "./admin/marketing";
import { ReportsAdmin } from "./admin/reports";
import { SupportAdmin } from "./admin/support";

type Tab = "dashboard" | "appointments" | "services" | "barbers" | "schedules" | "customers" | "marketing" | "reports" | "support";
const groups: { label: string; items: { label: string; value: Tab }[] }[] = [
  { label: "ĐIỀU HÀNH", items: [{ label: "Tổng quan", value: "dashboard" }, { label: "Lịch hẹn", value: "appointments" }] },
  { label: "SALON", items: [{ label: "Dịch vụ", value: "services" }, { label: "Thợ", value: "barbers" }, { label: "Ca làm", value: "schedules" }, { label: "Khách hàng", value: "customers" }] },
  { label: "KINH DOANH", items: [{ label: "Ưu đãi", value: "marketing" }, { label: "Báo cáo", value: "reports" }, { label: "Hỗ trợ", value: "support" }] }
];
const tabLabel = Object.fromEntries(groups.flatMap((group) => group.items.map((item) => [item.value, item.label]))) as Record<Tab, string>;
export function Admin({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [refreshKey, setRefreshKey] = useState(0);
  const [appointmentPreset, setAppointmentPreset] = useState<{ id: number; filter: AppointmentFilter }>({ id: 0, filter: {} });
  const [schedulePreset, setSchedulePreset] = useState({ id: 0, barberId: "" });
  const barbers = useAdminList<Barber[]>("/admin/barbers");
  const selectedGroup = groups.find((group) => group.items.some((item) => item.value === tab)) || groups[0];
  function changed() { setRefreshKey((value) => value + 1); }
  function openAppointments(filter: AppointmentFilter) { setAppointmentPreset((value) => ({ id: value.id + 1, filter })); setTab("appointments"); }
  function openSchedules(barberId: string) { setSchedulePreset((value) => ({ id: value.id + 1, barberId })); setTab("schedules"); }
  return <Page key={tab}><View style={{ width: "100%", maxWidth: 960, alignSelf: "center", gap: 12 }}>
    <View style={[styles.card, { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingVertical: 12 }]}>
      <View style={{ flex: 1 }}><Text style={[styles.muted, { fontSize: 11, letterSpacing: 1.2, fontWeight: "700" }]}>HAIRMATCH · QUẢN TRỊ</Text><Text style={[styles.subtitle, { color: colors.text }]}>Xin chào, {user.name}</Text><ShopClock label="Đồng hồ máy" /></View>
      <Button title="Đăng xuất" secondary onPress={onLogout} />
    </View>
    <View style={{ flexDirection: "row", gap: 7 }}>{groups.map((group) => {
      const selected = group === selectedGroup;
      return <Pressable key={group.label} onPress={() => setTab(group.items[0].value)} style={[styles.button, selected ? null : styles.buttonSecondary, { paddingVertical: 9, paddingHorizontal: 12 }]}><Text style={[styles.buttonText, !selected && { color: colors.text }, { fontSize: 12 }]}>{group.label}</Text></Pressable>;
    })}</View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 3 }}>
      {selectedGroup.items.map((item) => <Pressable key={item.value} onPress={() => setTab(item.value)} style={[styles.card, { paddingVertical: 8, paddingHorizontal: 13, borderRadius: 999 }, tab === item.value && { backgroundColor: colors.cream, borderColor: colors.gold }]}><Text style={[styles.text, tab === item.value && { color: colors.dark }, { fontSize: 13, fontWeight: tab === item.value ? "700" : "500" }]}>{item.label}</Text></Pressable>)}
    </ScrollView>
    <Text style={[styles.muted, { fontSize: 12 }]}>{selectedGroup.label} / {tabLabel[tab]}</Text>
    <DataState loading={barbers.loading} error={barbers.error} retry={() => void barbers.reload()} />
    {tab === "dashboard" && <DashboardAdmin active refreshKey={refreshKey} openAppointments={openAppointments} />}
    {tab === "appointments" && <AppointmentsAdmin active barbers={barbers.data || []} preset={appointmentPreset} onChanged={changed} />}
    {tab === "services" && <ServicesAdmin active onChanged={changed} />}
    {tab === "barbers" && <BarbersAdmin active onChanged={() => { changed(); void barbers.reload(); }} showAppointments={(id) => openAppointments({ barberId: id })} showSchedules={openSchedules} />}
    {tab === "schedules" && <SchedulesAdmin active barbers={barbers.data || []} preset={schedulePreset} />}
    {tab === "customers" && <CustomersAdmin />}
    {tab === "marketing" && <MarketingAdmin active />}
    {tab === "reports" && <ReportsAdmin active />}
    {tab === "support" && <SupportAdmin active />}
  </View></Page>;
}
