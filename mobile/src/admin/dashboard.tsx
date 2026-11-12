import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { AdminDashboard, Appointment } from "../types";
import { Button, Card, dateTimeLabel, money, shopDate, styles, colors, statusLabel, timeLabel } from "../ui";
import { DataState, FormModal, useAdminList } from "./components";

export function DashboardAdmin({ active, refreshKey }: { active: boolean; refreshKey: number }) {
  const [statusGridWidth, setStatusGridWidth] = useState(0);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const live = useAdminList<AdminDashboard>(`/admin/dashboard-live?refresh=${refreshKey}`, active);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => { void live.reload(true); }, 15000);
    return () => clearInterval(timer);
  }, [active, live.reload]);
  const data = live.data;
  const statusColumns = statusGridWidth >= 640 ? 4 : statusGridWidth >= 380 ? 2 : 1;
  const statusGap = 8;
  const statusCardWidth = statusGridWidth > 0
    ? (statusGridWidth - statusGap * (statusColumns - 1)) / statusColumns
    : undefined;
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
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}>{cards.map((card) => <View key={card.label} style={[styles.card, { minWidth: 150, flexGrow: 1, flexBasis: "42%" }]}>
        <Text style={styles.muted}>{card.label}</Text><Text style={[styles.subtitle, { color: colors.gold, fontSize: 23 }]}>{card.value}</Text><Text style={[styles.muted, { fontSize: 11 }]}>{card.hint}</Text>
      </View>)}</View>
      <Text style={styles.subtitle}>Lịch trong tuần này</Text>
      {data.upcoming.length === 0 && <Card><Text style={styles.muted}>Tuần này chưa có lịch hẹn.</Text></Card>}
      {data.upcoming.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Chi tiết lịch ${item.customerNameSnapshot}`} onPress={() => setSelectedAppointment(item)}>
        <Card style={{ padding: 11, gap: 4 }}>
          <Text style={styles.text} numberOfLines={1}>{item.customerNameSnapshot} · {item.serviceNameSnapshot}</Text>
          <Text style={styles.muted} numberOfLines={1}>{dateTimeLabel(item.startAt)} · {item.barberNameSnapshot} · {statusLabel[item.status]}</Text>
          <Text style={{ color: colors.gold, fontSize: 12, fontWeight: "700" }}>Xem chi tiết lịch →</Text>
        </Card>
      </Pressable>)}
      <FormModal title="Chi tiết lịch hẹn" visible={!!selectedAppointment} onClose={() => setSelectedAppointment(null)}>
        {selectedAppointment && <View style={{ gap: 9 }}>
          <Text style={styles.subtitle}>{selectedAppointment.customerNameSnapshot}</Text>
          <Text style={styles.text}>Mã lịch: {selectedAppointment.id}</Text>
          {!!selectedAppointment.customerPhoneSnapshot && <Text style={styles.text}>Số điện thoại: {selectedAppointment.customerPhoneSnapshot}</Text>}
          <Text style={styles.text}>Dịch vụ: {selectedAppointment.serviceNameSnapshot}</Text>
          {!!selectedAppointment.serviceItems?.length && selectedAppointment.serviceItems.map((service) => <Text key={service.id} style={styles.muted}>• {service.name} · {service.durationMinutes} phút · {money(service.price)}</Text>)}
          <Text style={styles.text}>Thợ: {selectedAppointment.barberNameSnapshot}</Text>
          <Text style={styles.text}>Thời gian: {dateTimeLabel(selectedAppointment.startAt)} – {timeLabel(selectedAppointment.endAt)}</Text>
          <Text style={styles.text}>Trạng thái: {statusLabel[selectedAppointment.status]}</Text>
          <Text style={styles.text}>Tổng tiền: {money(selectedAppointment.priceSnapshot)}</Text>
          {!!selectedAppointment.note && <Text style={styles.muted}>Ghi chú của khách: {selectedAppointment.note}</Text>}
          {!!selectedAppointment.styleName && <Text style={styles.muted}>Kiểu tóc mong muốn: {selectedAppointment.styleName}</Text>}
          {!!selectedAppointment.voucherCode && <Text style={styles.muted}>Mã ưu đãi: {selectedAppointment.voucherCode} · Giảm {money(selectedAppointment.discountAmount || 0)}</Text>}
          {selectedAppointment.paymentMethod && <Text style={styles.muted}>Thanh toán: {selectedAppointment.paymentMethod} · Đã thu {money(selectedAppointment.amountPaid || 0)}</Text>}
          {selectedAppointment.walkIn && <Text style={styles.muted}>Khách đặt trực tiếp tại tiệm</Text>}
        </View>}
      </FormModal>
      <Text style={styles.subtitle}>Trạng thái thợ</Text>
      <View
        onLayout={({ nativeEvent }) => setStatusGridWidth((current) => Math.abs(current - nativeEvent.layout.width) < 1 ? current : nativeEvent.layout.width)}
        style={{ flexDirection: "row", flexWrap: "wrap", gap: statusGap }}
      >{data.stylistStatus.map((item) => <Card key={item.barberId} style={{ width: statusCardWidth, minWidth: 0, flexGrow: 0, flexShrink: 0 }}>
        <Text style={styles.text}>{item.name}</Text>
        <Text style={{ color: item.status === "available" ? colors.success : item.status === "busy" ? colors.gold : colors.danger, fontWeight: "700" }}>
          {item.status === "available" ? "Đang rảnh" : item.status === "busy" ? "Đang phục vụ" : "Đang nghỉ"}
        </Text>
        {item.appointment && <Text style={styles.muted}>{item.appointment.customerNameSnapshot}</Text>}
      </Card>)}</View>
    </>}
  </View>;
}
