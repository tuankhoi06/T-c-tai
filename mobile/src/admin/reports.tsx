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
  const peakMax = Math.max(1, ...(data?.peakHours.map((item) => item.count) || [1]));
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
        {[{ label: "Giá trị hoàn thành", value: money(data.completedRevenue) }, { label: "Thực thu", value: money(data.paidRevenue) }, { label: "Dự kiến", value: money(data.expectedRevenue) }, { label: "Khách quay lại", value: `${data.retentionRate}%` }].map((item) => <Card key={item.label} style={{ minWidth: 150, flexGrow: 1, flexBasis: "42%" }}><Text style={styles.muted}>{item.label}</Text><Text style={[styles.subtitle, { color: colors.gold }]}>{item.value}</Text></Card>)}
      </View>
      <Text style={styles.subtitle}>Thanh toán thực thu</Text>
      {data.byPayment.map((row) => <Card key={row.method}><Text style={styles.text}>{row.method === "cash" ? "Tiền mặt" : row.method === "transfer" ? "Chuyển khoản" : "Thẻ"} · {money(row.total)}</Text></Card>)}
      <Text style={styles.subtitle}>Theo dịch vụ</Text>
      {data.byService.map((row) => <Card key={row.serviceId}><Text style={styles.text}>{row.name} · {row.count} lượt</Text><Text style={styles.muted}>{money(row.revenue)}</Text></Card>)}
      <Text style={styles.subtitle}>Hiệu suất thợ</Text>
      {data.byBarber.map((row) => <Card key={row.barberId}><Text style={styles.text}>{row.name} · {row.count} lượt</Text><Text style={styles.muted}>Giá trị {money(row.revenue)} · Hoa hồng {money(row.commission)} · {row.ratingAverage == null ? "Chưa có đánh giá" : `★ ${row.ratingAverage}/5`}</Text></Card>)}
      <Text style={styles.subtitle}>Giờ cao điểm / vắng khách</Text>
      {data.peakHours.map((row) => <View key={row.hour} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Text style={[styles.muted, { width: 50 }]}>{String(row.hour).padStart(2, "0")}:00</Text><View style={{ flex: 1, backgroundColor: colors.card, height: 16, borderRadius: 8 }}><View style={{ width: `${row.count / peakMax * 100}%`, height: 16, borderRadius: 8, backgroundColor: colors.gold }} /></View><Text style={styles.muted}>{row.count}</Text></View>)}
    </>}
  </View>;
}
