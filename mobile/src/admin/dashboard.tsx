import React, { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import type { AdminDashboard } from "../types";
import { Button, Card, dateTimeLabel, money, shopDate, styles, colors, statusLabel } from "../ui";
import { DataState, useAdminList } from "./components";
import type { AppointmentFilter } from "./appointments";

export function DashboardAdmin({ active, refreshKey, openAppointments }: {
  active: boolean; refreshKey: number; openAppointments: (filter: AppointmentFilter) => void;
}) {
  const live = useAdminList<AdminDashboard>(`/admin/dashboard-live?refresh=${refreshKey}`, active);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => { void live.reload(true); }, 15000);
    return () => clearInterval(timer);
  }, [active, live.reload]);
  const data = live.data;
  const cards = data ? [
    { label: "Lịch hẹn hôm nay", value: String(data.todayTotal), hint: "Tất cả trạng thái" },
    { label: "Đang phục vụ", value: String(data.inService), hint: "Cập nhật theo lịch" },
    { label: "Doanh thu dự kiến", value: money(data.expectedRevenue), hint: "Lịch chưa hoàn thành" },
    { label: "Thực thu", value: money(data.paidRevenue), hint: "Đã ghi nhận thanh toán" },
    { label: "Tỷ lệ hủy / vắng", value: `${data.cancellationRate}%`, hint: "Trong ngày" }
  ] : [];
  return <View style={{ gap: 15 }}>
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
      <View><Text style={styles.subtitle}>Hôm nay · {shopDate()}</Text><Text style={styles.muted}>Tự cập nhật mỗi 15 giây theo giờ tiệm.</Text></View>
      <Button title="Làm mới" secondary disabled={live.loading} onPress={() => void live.reload()} />
    </View>
    <DataState loading={live.loading} error={live.error} retry={() => void live.reload()} />
    {data && <>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}>{cards.map((card) => <Pressable key={card.label} onPress={() => openAppointments({ date: shopDate() })} style={[styles.card, { minWidth: 150, flexGrow: 1, flexBasis: "42%" }]}>
        <Text style={styles.muted}>{card.label}</Text><Text style={[styles.subtitle, { color: colors.gold, fontSize: 23 }]}>{card.value}</Text><Text style={[styles.muted, { fontSize: 11 }]}>{card.hint}</Text>
      </Pressable>)}</View>
      <Text style={styles.subtitle}>Lịch kế tiếp</Text>
      {data.upcoming.length === 0 && <Card><Text style={styles.muted}>Không có lịch sắp tới.</Text></Card>}
      {data.upcoming.map((item) => <Card key={item.id}>
        <Text style={styles.text}>{item.customerNameSnapshot} · {item.serviceNameSnapshot}</Text>
        <Text style={styles.muted}>{dateTimeLabel(item.startAt)} · {item.barberNameSnapshot} · {statusLabel[item.status]}</Text>
        <Button title="Mở lịch" secondary onPress={() => openAppointments({ q: item.id })} />
      </Card>)}
      <Text style={styles.subtitle}>Trạng thái thợ</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{data.stylistStatus.map((item) => <Card key={item.barberId} style={{ minWidth: 150, flexGrow: 1 }}>
        <Text style={styles.text}>{item.name}</Text>
        <Text style={{ color: item.status === "available" ? colors.success : item.status === "busy" ? colors.gold : colors.muted, fontWeight: "700" }}>
          {item.status === "available" ? "Đang rảnh" : item.status === "busy" ? "Đang phục vụ" : "Ngoài ca / nghỉ"}
        </Text>
        {item.appointment && <Text style={styles.muted}>{item.appointment.customerNameSnapshot}</Text>}
      </Card>)}</View>
    </>}
  </View>;
}
