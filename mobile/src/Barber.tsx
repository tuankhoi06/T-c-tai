import React, { useEffect, useMemo, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "./api";
import type { LeaveRequest, User } from "./types";
import { Button, Card, DragScrollView, ErrorText, Field, Page, colors, dateTimeLabel, money, shopDate, styles, timeLabel } from "./ui";
import { DateField } from "./admin/components";
import { SupportInbox, type CustomerSearchResult, type SupportContact, type SupportMessage } from "./SupportInbox";
import { salonPhone } from "./customer/salon";
import { QuickContactModal } from "./QuickContactModal";

type BarberTab = "today" | "schedule" | "performance" | "leave" | "messages" | "profile";
type BarberAppointment = {
  id: string;
  customerId?: string;
  customerNameSnapshot: string;
  customerPhone?: string;
  customerPhoneSnapshot?: string;
  serviceNameSnapshot: string;
  startAt: string;
  endAt: string;
  status: "pending" | "confirmed" | "in_progress" | "completed" | "cancelled" | "no_show";
  aiHaircutName?: string;
  aiBarberNote?: string;
  styleName?: string;
  note?: string;
  commission?: number;
};
type BarberDay = { appointments: BarberAppointment[]; todayCount: number; monthCount: number; todayCommission: number; monthCommission: number };
type BarberProfile = { id: string; name: string; bio: string; imageUrl: string; title?: string; commissionRate: number; serviceNames: string[] };
type BarberWorkSchedule = { id: string; date: string; startTime: string; endTime: string; activeAppointmentCount: number };

const statusText: Record<BarberAppointment["status"], string> = {
  pending: "Chờ xác nhận", confirmed: "Đã xác nhận", in_progress: "Đang phục vụ",
  completed: "Hoàn thành", cancelled: "Đã hủy", no_show: "Khách vắng mặt"
};
const statusColor: Record<BarberAppointment["status"], string> = {
  pending: colors.statusPending, confirmed: colors.statusConfirmed, in_progress: colors.statusInProgress,
  completed: colors.statusCompleted, cancelled: colors.statusCancelled, no_show: colors.statusNoShow
};

function shiftDate(value: string, offset: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function mondayOf(value: string) {
  const day = new Date(`${value}T12:00:00Z`).getUTCDay();
  return shiftDate(value, -((day + 6) % 7));
}

function weekdayLabel(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { timeZone: "UTC", weekday: "short" }).format(new Date(`${value}T12:00:00Z`));
}

function AppointmentCard({ item, busy, canUpdate, onChange, onContact }: {
  item: BarberAppointment; busy: boolean; canUpdate: boolean; onChange: (status: "in_progress" | "completed") => void; onContact?: () => void;
}) {
  return <Card style={{ borderLeftWidth: 4, borderLeftColor: statusColor[item.status] }}>
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
      <View style={{ flex: 1, gap: 3 }}><Text style={styles.subtitle}>{timeLabel(item.startAt)} · {item.customerNameSnapshot}</Text><Text style={styles.muted}>{dateTimeLabel(item.startAt)} – {timeLabel(item.endAt)}</Text></View>
      <Text style={{ color: statusColor[item.status], fontWeight: "700", textAlign: "right" }}>{statusText[item.status]}</Text>
    </View>
    <Text style={styles.text}>{item.serviceNameSnapshot}</Text>
    {(item.aiHaircutName || item.styleName) && <View style={{ backgroundColor: colors.input, borderRadius: 10, padding: 11, gap: 3 }}>
      <Text style={{ color: colors.gold, fontWeight: "700" }}>✦ Kiểu tóc khách chọn</Text><Text style={styles.text}>{item.aiHaircutName || item.styleName}</Text>
      {!!item.aiBarberNote && <Text style={styles.muted}>{item.aiBarberNote}</Text>}
    </View>}
    {!!item.note && <Text style={styles.muted}>Ghi chú: {item.note}</Text>}
    {item.status === "completed" && !!item.commission && <Text style={{ color: colors.success, fontWeight: "700" }}>Hoa hồng ca này: {money(item.commission)}</Text>}
    {!!item.customerId && <View style={styles.row}><Button title="Nhắn khách" secondary onPress={onContact || (() => {})} />{item.customerPhoneSnapshot && <Button title="Gọi khách" secondary onPress={() => void Linking.openURL(`tel:${item.customerPhoneSnapshot}`)} />}</View>}
    {canUpdate && item.status === "confirmed" && <Button title={busy ? "Đang cập nhật..." : "Bắt đầu phục vụ"} disabled={busy} onPress={() => onChange("in_progress")} />}
    {canUpdate && item.status === "in_progress" && <Button title={busy ? "Đang cập nhật..." : "Hoàn thành ca"} disabled={busy} onPress={() => onChange("completed")} />}
  </Card>;
}

export function BarberApp({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [tab, setTab] = useState<BarberTab>("today");
  const [day, setDay] = useState<BarberDay | null>(null);
  const [schedule, setSchedule] = useState<BarberAppointment[]>([]);
  const [workSchedules, setWorkSchedules] = useState<BarberWorkSchedule[]>([]);
  const [scheduleRange, setScheduleRange] = useState({ from: "", to: "" });
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [monthItems, setMonthItems] = useState<BarberAppointment[]>([]);
  const [profile, setProfile] = useState<BarberProfile | null>(null);
  const [selectedDate, setSelectedDate] = useState(shopDate());
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [supportMessages, setSupportMessages] = useState<SupportMessage[]>([]);
  const [supportContacts, setSupportContacts] = useState<SupportContact[]>([]);
  const [supportError, setSupportError] = useState("");
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [contactAppointment, setContactAppointment] = useState<BarberAppointment | null>(null);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [leaveFrom, setLeaveFrom] = useState(shopDate(1));
  const [leaveTo, setLeaveTo] = useState(shopDate(1));
  const [leaveReason, setLeaveReason] = useState("");
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveError, setLeaveError] = useState("");
  const [leaveMessage, setLeaveMessage] = useState("");

  async function load() {
    try {
      const today = shopDate();
      const monthStart = `${today.slice(0, 7)}-01`;
      const scheduleFrom = mondayOf(today);
      const scheduleTo = shiftDate(scheduleFrom, 13);
      const [todayData, scheduleData, workScheduleData, monthData, profileData] = await Promise.all([
        api<BarberDay>("/barber/today"),
        api<BarberAppointment[]>(`/barber/appointments?from=${scheduleFrom}&to=${scheduleTo}`),
        api<BarberWorkSchedule[]>(`/barber/work-schedules?from=${scheduleFrom}&to=${scheduleTo}`),
        api<BarberAppointment[]>(`/barber/appointments?from=${monthStart}&to=${today}`),
        api<BarberProfile>("/barber/profile")
      ]);
      setDay(todayData); setSchedule(scheduleData); setWorkSchedules(workScheduleData); setScheduleRange({ from: scheduleFrom, to: scheduleTo });
      setMonthItems(monthData); setProfile(profileData); setError("");
    } catch (err: any) { setError(err.message || "Không tải được dữ liệu ca làm."); }
  }

  async function loadScheduleRange(from: string, to: string) {
    setScheduleLoading(true); setError("");
    try {
      const [appointments, shifts] = await Promise.all([
        api<BarberAppointment[]>(`/barber/appointments?from=${from}&to=${to}`),
        api<BarberWorkSchedule[]>(`/barber/work-schedules?from=${from}&to=${to}`)
      ]);
      setSchedule(appointments); setWorkSchedules(shifts); setScheduleRange({ from, to });
    } catch (err: any) { setError(err.message || "Không tải được lịch tuần."); }
    finally { setScheduleLoading(false); }
  }

  function chooseScheduleDate(date: string) {
    setSelectedDate(date);
    const from = mondayOf(date), to = shiftDate(from, 6);
    if (from < scheduleRange.from || to > scheduleRange.to) void loadScheduleRange(from, to);
  }

  function goToScheduleWeek(offset: number) {
    chooseScheduleDate(shiftDate(mondayOf(selectedDate), offset * 7));
  }
  useEffect(() => {
    void load();
    const refresh = setInterval(() => void load(), 30000);
    return () => clearInterval(refresh);
  }, []);

  useEffect(() => {
    let live = true;
    const refreshUnread = async () => {
      try { const result = await api<{ count: number }>("/messages/unread-count"); if (live) setUnreadMessages(result.count); }
      catch { /* Keep the last known badge while offline. */ }
    };
    void refreshUnread();
    const timer = setInterval(() => void refreshUnread(), 12000);
    return () => { live = false; clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (tab !== "messages") return;
    let live = true;
    const loadInbox = async () => {
      try { const [items, contacts] = await Promise.all([api<SupportMessage[]>("/support/messages/me"), api<SupportContact[]>("/messaging/contacts")]); if (live) { setSupportMessages(items); setSupportContacts(contacts); setSupportError(""); } }
      catch (err: any) { if (live) setSupportError(err.message || "Không tải được hộp thư."); }
    };
    void loadInbox();
    const refresh = setInterval(() => void loadInbox(), 15000);
    return () => { live = false; clearInterval(refresh); };
  }, [tab]);

  useEffect(() => {
    if (tab !== "leave") return;
    let live = true;
    const loadLeaves = async () => {
      try { const items = await api<LeaveRequest[]>("/barber/leaves"); if (live) { setLeaveRequests(items); setLeaveError(""); } }
      catch (err: any) { if (live) setLeaveError(err.message || "Không tải được đơn xin nghỉ."); }
    };
    void loadLeaves();
    const refresh = setInterval(() => void loadLeaves(), 15000);
    return () => { live = false; clearInterval(refresh); };
  }, [tab]);

  async function sendSupport(body: string, recipientId?: string) {
    if (!recipientId) throw new Error("Hãy chọn người nhận trước khi gửi.");
    await api("/messages", { method: "POST", body: { recipientId, message: body } });
    const [messages, contacts] = await Promise.all([api<SupportMessage[]>("/support/messages/me"), api<SupportContact[]>("/messaging/contacts")]);
    setSupportMessages(messages); setSupportContacts(contacts);
  }

  async function replySupport(threadId: string, body: string) {
    await api("/messages/" + threadId + "/reply", { method: "POST", body: { body } });
    const [messages, contacts] = await Promise.all([api<SupportMessage[]>("/support/messages/me"), api<SupportContact[]>("/messaging/contacts")]);
    setSupportMessages(messages); setSupportContacts(contacts);
  }

  async function markSupportRead(threadId: string) {
    await api(`/messages/${threadId}/read`, { method: "POST" });
    const result = await api<{ count: number }>("/messages/unread-count");
    setUnreadMessages(result.count);
    const [messages, contacts] = await Promise.all([api<SupportMessage[]>("/support/messages/me"), api<SupportContact[]>("/messaging/contacts")]);
    setSupportMessages(messages); setSupportContacts(contacts);
  }

  async function markMessagesRead() {
    try {
      const result = await api<{ count: number }>("/messages/read-all", { method: "POST" });
      setUnreadMessages(result.count);
      if (tab === "messages") {
        const messages = await api<SupportMessage[]>("/support/messages/me");
        setSupportMessages(messages);
      }
    } catch (err: any) { setSupportError(err.message || "Không thể đánh dấu tin nhắn đã đọc."); }
  }

  async function searchCustomers(query: string) {
    return api<CustomerSearchResult[]>("/customers/search?q=" + encodeURIComponent(query));
  }

  async function submitLeave() {
    if (leaveBusy || leaveFrom > leaveTo || leaveReason.trim().length < 2) return;
    setLeaveBusy(true); setLeaveError(""); setLeaveMessage("");
    try {
      await api<LeaveRequest>("/barber/leaves", { method: "POST", body: { from: leaveFrom, to: leaveTo, reason: leaveReason.trim() } });
      setLeaveReason(""); setLeaveMessage("Đã gửi đơn nghỉ. Quản lý sẽ xem xét và cập nhật trạng thái.");
      setLeaveRequests(await api<LeaveRequest[]>("/barber/leaves"));
    } catch (err: any) { setLeaveError(err.message || "Không gửi được đơn xin nghỉ."); }
    finally { setLeaveBusy(false); }
  }

  async function change(item: BarberAppointment, status: "in_progress" | "completed") {
    setBusyId(item.id); setError("");
    try { await api(`/barber/appointments/${item.id}/status`, { method: "PATCH", body: { status } }); await load(); }
    catch (err: any) { setError(err.message || "Không cập nhật được ca."); }
    finally { setBusyId(""); }
  }

  const selectedAppointments = useMemo(() => schedule.filter((item) => item.startAt.slice(0, 10) === selectedDate), [schedule, selectedDate]);
  const monthCompleted = monthItems.filter((item) => item.status === "completed");
  const serviceSummary = Object.entries(monthCompleted.reduce<Record<string, { count: number; commission: number }>>((summary, item) => {
    const current = summary[item.serviceNameSnapshot] || { count: 0, commission: 0 };
    summary[item.serviceNameSnapshot] = { count: current.count + 1, commission: current.commission + (item.commission || 0) };
    return summary;
  }, {})).sort((a, b) => b[1].count - a[1].count);
  const nextAppointment = day?.appointments.find((item) => ["confirmed", "in_progress"].includes(item.status));
  const tabs: { id: BarberTab; icon: string; label: string }[] = [
    { id: "today", icon: "⌂", label: "Tổng quan" }, { id: "schedule", icon: "▦", label: "Lịch làm" },
    { id: "performance", icon: "↗", label: "Hiệu suất" }, { id: "leave", icon: "◷", label: "Xin nghỉ" }, { id: "messages", icon: "✉", label: "Hòm thư" }, { id: "profile", icon: "◉", label: "Hồ sơ" }
  ];

  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <View style={{ flex: 1 }}><Page key={tab}>
      <View style={{ minHeight: 48, justifyContent: "flex-end", paddingTop: 22 }}><Text style={styles.title}>{tab === "today" ? `Xin chào, ${user.name.split(" · ")[0]}` : tabs.find((item) => item.id === tab)?.label}</Text></View>
      {unreadMessages > 0 && <View style={[styles.card, { borderColor: colors.danger, backgroundColor: colors.card, gap: 8 }]}><Pressable onPress={() => setTab("messages")}><Text style={{ color: colors.danger, fontWeight: "800" }}>✉ {unreadMessages} cuộc trò chuyện chưa đọc · Mở hòm thư</Text></Pressable><Button title="Đánh dấu tin nhắn đã đọc" secondary onPress={() => void markMessagesRead()} /></View>}
      <ErrorText message={error} />

      {tab === "today" && <>
        <Card style={{ borderColor: colors.gold, backgroundColor: colors.input }}>
          <Text style={styles.subtitle}>Ca làm hôm nay</Text>
          <Text style={styles.text}>{new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", weekday: "long", day: "numeric", month: "long" }).format(new Date())}</Text>
          <View style={styles.row}><Text style={styles.muted}>✂ {day?.appointments.length || 0} lịch</Text><Text style={styles.muted}>✓ {day?.todayCount || 0} ca xong</Text><Text style={styles.muted}>＋ {money(day?.todayCommission || 0)}</Text></View>
        </Card>
        {nextAppointment && <Card><Text style={{ color: colors.gold, fontWeight: "700" }}>LỊCH TIẾP THEO</Text><Text style={styles.subtitle}>{timeLabel(nextAppointment.startAt)} · {nextAppointment.customerNameSnapshot}</Text><Text style={styles.muted}>{nextAppointment.serviceNameSnapshot}</Text></Card>}
        <View style={styles.row}><Button title="Xem lịch 14 ngày" secondary onPress={() => setTab("schedule")} /><Button title="Xem thu nhập" secondary onPress={() => setTab("performance")} /><Button title="Làm mới" secondary onPress={() => void load()} /></View>
        <Text style={styles.subtitle}>Danh sách ca</Text>
        {!day?.appointments.length && <Card><Text style={styles.text}>Hôm nay chưa có lịch được giao.</Text><Text style={styles.muted}>Lịch mới sẽ tự xuất hiện ở đây.</Text></Card>}
        {day?.appointments.map((item) => <AppointmentCard key={item.id} item={item} canUpdate onChange={(status) => void change(item, status)} onContact={() => setContactAppointment(item)} busy={busyId === item.id} />)}
      </>}

      {tab === "schedule" && <>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <View><Text style={styles.subtitle}>Lịch tuần</Text><Text style={styles.muted}>Ca làm và lịch hẹn của bạn</Text></View>
          <Button title={scheduleLoading ? "Đang tải..." : "↻ Tải lại"} secondary disabled={scheduleLoading} onPress={() => void loadScheduleRange(scheduleRange.from || mondayOf(selectedDate), scheduleRange.to || shiftDate(mondayOf(selectedDate), 13))} />
        </View>
        <Card style={{ padding: 12, gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Tuần trước" onPress={() => goToScheduleWeek(-1)} style={{ width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: colors.input }}><Text style={{ color: colors.gold, fontSize: 24 }}>‹</Text></Pressable>
            <View style={{ alignItems: "center", flex: 1 }}>
              <Button title="Hôm nay" secondary onPress={() => chooseScheduleDate(shopDate())} />
              <Text style={[styles.muted, { marginTop: 6, textAlign: "center" }]}>{mondayOf(selectedDate)} — {shiftDate(mondayOf(selectedDate), 6)}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Tuần sau" onPress={() => goToScheduleWeek(1)} style={{ width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: colors.input }}><Text style={{ color: colors.gold, fontSize: 24 }}>›</Text></Pressable>
          </View>
          <Text style={styles.muted}>{scheduleLoading ? "Đang tải lịch…" : `${workSchedules.filter((item) => item.date >= mondayOf(selectedDate) && item.date <= shiftDate(mondayOf(selectedDate), 6)).length} ca làm trong tuần`}</Text>
          <DragScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ gap: 8, paddingBottom: 6 }}>
              {Array.from({ length: 7 }, (_, offset) => {
                const date = shiftDate(mondayOf(selectedDate), offset);
                const shifts = workSchedules.filter((item) => item.date === date);
                const appointments = schedule.filter((item) => item.startAt.slice(0, 10) === date);
                return <Pressable key={date} accessibilityRole="button" accessibilityLabel={`${weekdayLabel(date)} ${date}`} onPress={() => chooseScheduleDate(date)} style={{ width: 150, minHeight: 150, backgroundColor: selectedDate === date ? colors.input : colors.card, borderRadius: 13, borderWidth: 1, borderColor: selectedDate === date ? colors.gold : colors.border, padding: 10, gap: 8 }}>
                  <View style={{ paddingBottom: 7, borderBottomWidth: 1, borderColor: colors.border }}><Text style={{ color: date === shopDate() ? colors.gold : colors.text, fontWeight: "800" }}>{weekdayLabel(date)}{date === shopDate() ? " · Hôm nay" : ""}</Text><Text style={styles.muted}>{date.slice(5)} · {appointments.length} lịch</Text></View>
                  {!shifts.length && !appointments.length && <Text style={[styles.muted, { paddingVertical: 8 }]}>Không có ca</Text>}
                  {shifts.map((shift) => <View key={shift.id} style={{ backgroundColor: colors.input, borderLeftWidth: 3, borderLeftColor: colors.gold, borderRadius: 8, padding: 8, gap: 3 }}><Text style={{ color: colors.gold, fontWeight: "800" }}>{shift.startTime}–{shift.endTime}</Text><Text style={[styles.muted, { fontSize: 11 }]}>{shift.activeAppointmentCount} lịch đang hiệu lực</Text></View>)}
                  {!!appointments.length && <Text style={[styles.muted, { fontSize: 11 }]}>{appointments.length} lịch hẹn trong ngày</Text>}
                </Pressable>;
              })}
          </DragScrollView>
        </Card>
        <Text style={styles.subtitle}>Ngày {selectedDate}</Text>
        {workSchedules.filter((item) => item.date === selectedDate).map((shift) => <Card key={shift.id} style={{ borderLeftWidth: 4, borderLeftColor: colors.gold }}><Text style={styles.text}>Ca làm · {shift.startTime}–{shift.endTime}</Text><Text style={styles.muted}>{shift.activeAppointmentCount} lịch hẹn đang hiệu lực trong ca</Text></Card>)}
        {!selectedAppointments.length && <Card><Text style={styles.text}>{workSchedules.some((item) => item.date === selectedDate) ? "Bạn chưa có lịch hẹn trong ca này." : "Ngày này chưa được xếp ca làm."}</Text></Card>}
        {selectedAppointments.map((item) => <AppointmentCard key={item.id} item={item} canUpdate={selectedDate === shopDate()} onChange={(status) => void change(item, status)} onContact={() => setContactAppointment(item)} busy={busyId === item.id} />)}
      </>}

      {tab === "performance" && <>
        <Text style={styles.muted}>Thống kê theo ngày của lịch trong tháng này. Chỉ tính lịch đã hoàn thành.</Text>
        <Card style={{ padding: 11 }}><Text style={styles.muted}>Hoa hồng = giá lịch sau giảm × tỷ lệ hoa hồng. Lịch mới dùng tỷ lệ được chốt khi hoàn thành; dữ liệu cũ chưa có tỷ lệ chốt sẽ dùng tỷ lệ hiện tại trong hồ sơ thợ.</Text></Card>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}>
          <Card style={{ flexGrow: 1, minWidth: 145 }}><Text style={styles.muted}>Ca hoàn thành tháng này</Text><Text style={[styles.title, { color: colors.gold }]}>{monthCompleted.length}</Text></Card>
          <Card style={{ flexGrow: 1, minWidth: 145 }}><Text style={styles.muted}>Hoa hồng tháng này</Text><Text style={[styles.subtitle, { color: colors.gold }]}>{money(day?.monthCommission || 0)}</Text></Card>
          <Card style={{ flexGrow: 1, minWidth: 145 }}><Text style={styles.muted}>Hôm nay</Text><Text style={styles.subtitle}>{day?.todayCount || 0} ca · {money(day?.todayCommission || 0)}</Text></Card>
        </View>
        <Card><Text style={styles.subtitle}>Dịch vụ đã thực hiện</Text>
          {!serviceSummary.length && <Text style={styles.muted}>Chưa có ca hoàn thành trong tháng.</Text>}
          {serviceSummary.map(([name, value]) => <View key={name} style={{ flexDirection: "row", justifyContent: "space-between", gap: 10, borderTopWidth: 1, borderColor: colors.border, paddingTop: 8 }}><Text style={[styles.text, { flex: 1 }]}>{name}</Text><Text style={styles.muted}>{value.count} ca</Text><Text style={{ color: colors.gold }}>{money(value.commission)}</Text></View>)}
        </Card>
        <Text style={styles.subtitle}>Ca đã hoàn thành</Text>
        {!monthCompleted.length && <Card><Text style={styles.muted}>Chưa có ca hoàn tất trong tháng.</Text></Card>}
        {[...monthCompleted].reverse().map((item) => <AppointmentCard key={item.id} item={item} canUpdate={false} busy={false} onChange={() => {}} onContact={() => setContactAppointment(item)} />)}
      </>}

      {tab === "messages" && <><ErrorText message={supportError} /><SupportInbox messages={supportMessages} contacts={supportContacts} viewerRole="barber" viewerId={user.id} onCompose={sendSupport} onReply={replySupport} onSearchCustomers={searchCustomers} onRead={markSupportRead} /></>}

      {tab === "leave" && <>
        <Text style={styles.muted}>Gửi đơn xin nghỉ để quản lý duyệt. Đơn đã duyệt sẽ khóa lịch đặt trong khoảng ngày được chọn.</Text>
        <Card><DateField label="Từ ngày" value={leaveFrom} onChange={setLeaveFrom} /><DateField label="Đến ngày" value={leaveTo} onChange={setLeaveTo} /><Field label="Lý do xin nghỉ" value={leaveReason} onChange={setLeaveReason} multiline />
          <ErrorText message={leaveError} />{!!leaveMessage && <Text style={{ color: colors.success }}>{leaveMessage}</Text>}
          <Button title={leaveBusy ? "Đang gửi..." : "Gửi đơn xin nghỉ"} disabled={leaveBusy || leaveFrom < shopDate() || leaveFrom > leaveTo || leaveReason.trim().length < 2} onPress={() => void submitLeave()} />
        </Card>
        <Text style={styles.subtitle}>Đơn nghỉ của tôi</Text>
        {!leaveRequests.length && <Card><Text style={styles.muted}>Bạn chưa gửi đơn xin nghỉ nào.</Text></Card>}
        {leaveRequests.map((item) => <Card key={item.id}><Text style={styles.text}>{item.from} → {item.to}</Text><Text style={styles.muted}>{item.reason}</Text><Text style={{ color: item.status === "approved" ? colors.success : item.status === "rejected" ? colors.danger : colors.gold, fontWeight: "700" }}>{item.status === "approved" ? "Đã duyệt" : item.status === "rejected" ? "Từ chối" : "Chờ duyệt"}</Text></Card>)}
      </>}

      {tab === "profile" && <>
        <Card style={{ alignItems: "center", paddingVertical: 24 }}><View style={{ width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center", backgroundColor: colors.cream }}><Text style={{ color: colors.dark, fontSize: 28, fontWeight: "800" }}>{(profile?.name || user.name).split(/\s+/).slice(-1)[0]?.slice(0, 1)}</Text></View>
          <Text style={styles.title}>{profile?.name || user.name}</Text><Text style={{ color: colors.gold, fontWeight: "700" }}>{profile?.title === "master" ? "Master Barber" : profile?.title === "top" ? "Top Stylist" : "Stylist"}</Text><Text style={[styles.text, { textAlign: "center" }]}>{profile?.bio || "Thợ tóc HairMatch"}</Text>
        </Card>
        <Card><Text style={styles.subtitle}>Thông tin nghề nghiệp</Text><Text style={styles.text}>Mã thợ: {profile?.id || user.barberId}</Text><Text style={styles.text}>Tỷ lệ hoa hồng: {profile?.commissionRate ?? 0}%</Text><Text style={styles.text}>Tổng ca hoàn thành tháng này: {monthCompleted.length}</Text></Card>
        <Card><Text style={styles.subtitle}>Kỹ năng dịch vụ</Text><View style={styles.row}>{(profile?.serviceNames || []).map((name) => <Text key={name} style={{ color: colors.gold, backgroundColor: colors.input, padding: 9, borderRadius: 9 }}>{name}</Text>)}</View></Card>
        <Card><Text style={styles.subtitle}>Hỗ trợ từ salon</Text><Text style={styles.muted}>Liên hệ quản lý nếu cần điều chỉnh lịch làm hoặc thông tin ca. Hộp thư hỗ trợ tự cập nhật phản hồi của quản lý.</Text>{!!salonPhone && <Button title={`Gọi salon ${salonPhone}`} secondary onPress={() => void Linking.openURL(`tel:${salonPhone.replace(/\s/g, "")}`)} />}</Card>
        <Button title="Đăng xuất" secondary onPress={onLogout} />
      </>}
    </Page></View>

    <SafeAreaView edges={["bottom"]} style={{ backgroundColor: colors.dark, borderTopWidth: 1, borderColor: colors.border }}><View style={{ flexDirection: "row", maxWidth: 920, alignSelf: "center", width: "100%", paddingVertical: 7, paddingHorizontal: 8 }}>
      {tabs.map((item) => <Pressable key={item.id} accessibilityRole="button" onPress={() => setTab(item.id)} style={{ flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", paddingVertical: 6, borderRadius: 11, backgroundColor: tab === item.id ? colors.card : "transparent" }}><View><Text style={{ color: tab === item.id ? colors.gold : colors.muted, fontSize: 19 }}>{item.icon}</Text>{item.id === "messages" && unreadMessages > 0 && <View style={{ position: "absolute", top: -3, right: -10, minWidth: 15, height: 15, borderRadius: 8, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 }}><Text style={{ color: colors.text, fontSize: 9, fontWeight: "800" }}>{unreadMessages > 9 ? "9+" : unreadMessages}</Text></View>}</View><Text style={{ color: tab === item.id ? colors.gold : colors.muted, fontSize: 10 }}>{item.label}</Text></Pressable>)}
    </View></SafeAreaView>
    <QuickContactModal visible={!!contactAppointment} customerId={contactAppointment?.customerId} customerName={contactAppointment?.customerNameSnapshot || "Khách hàng"}
      appointmentId={contactAppointment?.id} onClose={() => setContactAppointment(null)} onSent={() => setTab("messages")} />
  </View>;
}
