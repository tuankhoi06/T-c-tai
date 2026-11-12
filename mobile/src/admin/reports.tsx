import React, { useState } from "react";
import { Text, View } from "react-native";
import type { AdminReport } from "../types";
import { Button, Card, colors, money, shopDate, styles } from "../ui";
import { Choice, DataState, DateField, useAdminList } from "./components";

type Period = "today" | "week" | "month" | "custom";
export function ReportsAdmin({ active }: { active: boolean }) {
  const [period, setPeriod] = useState<Period>("month");
  const [from, setFrom] = useState(shopDate().slice(0, 7) + "-01");
  const [to, setTo] = useState(shopDate());
  const today = shopDate();
  const range = period === "today" ? { from: today, to: today } : period === "week" ? { from: shopDate(-6), to: today } : period === "month" ? { from: today.slice(0, 7) + "-01", to: today } : { from, to };
  const valid = range.from <= range.to;
  const report = useAdminList<AdminReport>(`/admin/reports?from=${range.from}&to=${range.to}`, active && valid);
  const data = report.data;
  const hourlyCounts = data?.peakHours || [];
  const hourlyAverage = hourlyCounts.length ? hourlyCounts.reduce((total, item) => total + item.count, 0) / hourlyCounts.length : 0;
  const busiestHours = hourlyCounts.filter((item) => item.count > 0 && item.count >= hourlyAverage);
  const quietHours = hourlyCounts.filter((item) => item.count < hourlyAverage || item.count === 0);
  const renderHours = (hours: typeof hourlyCounts, color: string) => {
    const max = Math.max(1, ...hours.map((item) => item.count));
    if (!hours.length) return <Text style={styles.muted}>Chưa có dữ liệu trong khoảng này.</Text>;
    return hours.map((row) => <View key={row.hour} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Text style={[styles.muted, { width: 50 }]}>{String(row.hour).padStart(2, "0")}:00</Text>
      <View style={{ flex: 1, backgroundColor: colors.card, height: 14, borderRadius: 7, overflow: "hidden" }}>
        <View style={{ width: `${row.count / max * 100}%`, height: 14, borderRadius: 7, backgroundColor: color }} />
      </View>
      <Text style={[styles.muted, { minWidth: 45, textAlign: "right" }]}>{row.count} lượt</Text>
    </View>);
  };
  return <View style={{ gap: 13 }}>
    <Text style={styles.subtitle}>Báo cáo & phân tích</Text>
    <Choice value={period} onChange={(value) => setPeriod(value as Period)} options={[{ label: "Hôm nay", value: "today" }, { label: "7 ngày", value: "week" }, { label: "Tháng này", value: "month" }, { label: "Tùy chọn", value: "custom" }]} />
    {period === "custom" && <><DateField label="Từ ngày" value={from} onChange={setFrom} /><DateField label="Đến ngày" value={to} onChange={setTo} /></>}
    <Text style={styles.muted}>{range.from} → {range.to}</Text>
    {!valid && <Text style={styles.error}>Khoảng ngày không hợp lệ.</Text>}
    <Button title="Làm mới báo cáo" secondary onPress={() => void report.reload()} />
    <DataState loading={report.loading} error={report.error} retry={() => void report.reload()} />
    {valid && data && <>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {[{ label: "Giá trị dịch vụ đã thu", value: money(data.completedRevenue) }, { label: "Thực thu", value: money(data.paidRevenue) }, { label: "Dự kiến", value: money(data.expectedRevenue) }, { label: "Khách quay lại", value: `${data.retentionRate}%` }].map((item) => <Card key={item.label} style={{ minWidth: 150, flexGrow: 1, flexBasis: "42%" }}><Text style={styles.muted}>{item.label}</Text><Text style={[styles.subtitle, { color: colors.gold }]}>{item.value}</Text></Card>)}
      </View>
      <Text style={styles.subtitle}>Thanh toán thực thu</Text>
      {data.byPayment.map((row) => <Card key={row.method}><Text style={styles.text}>{row.method === "cash" ? "Tiền mặt" : row.method === "transfer" ? "Chuyển khoản" : "Thẻ"} · {money(row.total)}</Text></Card>)}
      <Text style={styles.subtitle}>Theo dịch vụ</Text>
      {data.byService.map((row) => <Card key={row.serviceId}><Text style={styles.text}>{row.name} · {row.count} lượt</Text><Text style={styles.muted}>{money(row.revenue)}</Text></Card>)}
      <Text style={styles.subtitle}>Hiệu suất thợ</Text>
      <Text style={styles.muted}>Lượt tính theo ca hoàn thành; doanh thu và hoa hồng chỉ cộng sau khi Admin xác nhận đã thu tiền.</Text>
      {data.byBarber.map((row) => <Card key={row.barberId}><Text style={styles.text}>{row.name} · {row.count} lượt</Text><Text style={styles.muted}>Giá trị {money(row.revenue)} · Hoa hồng {money(row.commission)} · {row.ratingAverage == null ? "Chưa có đánh giá" : `★ ${row.ratingAverage}/5`}</Text></Card>)}
      <Text style={styles.subtitle}>Khung giờ đông và vắng</Text>
      <Text style={styles.muted}>Tính theo giờ bắt đầu lịch hẹn trong khoảng đã chọn. Cao điểm là giờ có lượt đặt từ mức trung bình trở lên; vắng khách là dưới mức trung bình hoặc chưa có lượt.</Text>
      <Card style={{ gap: 9, borderColor: colors.gold }}>
        <Text style={[styles.text, { fontWeight: "800", color: colors.gold }]}>Giờ cao điểm · {busiestHours.length} khung giờ</Text>
        {renderHours(busiestHours, colors.gold)}
      </Card>
      <Card style={{ gap: 9 }}>
        <Text style={[styles.text, { fontWeight: "800" }]}>Giờ vắng khách · {quietHours.length} khung giờ</Text>
        {renderHours(quietHours, colors.success)}
      </Card>
    </>}
  </View>;
}
