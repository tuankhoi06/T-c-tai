import React, { useEffect, useState } from "react";
import { Pressable, SafeAreaView, Text, View } from "react-native";
import { api } from "./api";
import type { Appointment, Barber, HairService, Notification, User, Voucher } from "./types";
import { Button, Card, ErrorText, Loading, Page, colors, styles } from "./ui";
import { Consultation } from "./Consultation";
import { registerPushToken } from "./push";
import { CustomerHome } from "./customer/Home";
import { CustomerBooking, type BookingPreset } from "./customer/Booking";
import { CustomerBookings } from "./customer/Bookings";
import { CustomerProfile } from "./customer/Profile";

type Tab = "home" | "book" | "bookings" | "ai" | "profile" | "notifications";
export function Customer({ user, onLogout, onUserUpdated }: { user: User; onLogout: () => void; onUserUpdated: (user: User) => void }) {
  const [tab, setTab] = useState<Tab>("home");
  const [services, setServices] = useState<HairService[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [preset, setPreset] = useState<BookingPreset>();
  const [bookingKey, setBookingKey] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function refresh() {
    try {
      const [serviceData, barberData, appointmentData, voucherData, notificationData] = await Promise.all([
        api<HairService[]>("/services"), api<Barber[]>("/barbers"), api<Appointment[]>("/appointments/me"),
        api<Voucher[]>("/vouchers/me"), api<Notification[]>("/notifications/me")
      ]);
      setServices(serviceData); setBarbers(barberData); setAppointments(appointmentData);
      setVouchers(voucherData); setNotifications(notificationData); setError("");
    } catch (err: any) { setError(err.message || "Không tải được dữ liệu."); }
  }
  async function refreshAppointments() {
    const [appointmentData, voucherData, notificationData] = await Promise.all([
      api<Appointment[]>("/appointments/me"), api<Voucher[]>("/vouchers/me"), api<Notification[]>("/notifications/me")
    ]);
    setAppointments(appointmentData); setVouchers(voucherData); setNotifications(notificationData);
  }
  useEffect(() => {
    let live = true;
    setLoading(true);
    void refresh().finally(() => { if (live) setLoading(false); });
    void registerPushToken();
    const timer = setInterval(() => { if (live) void refreshAppointments().catch(() => {}); }, 30000);
    return () => { live = false; clearInterval(timer); };
  }, []);
  function openBook(next?: BookingPreset) { setPreset(next); setBookingKey((n) => n + 1); setTab("book"); setMessage(""); }
  function booked(item: Appointment) {
    setMessage(`Đã đặt lịch ${item.serviceNameSnapshot}. Mã nhận lịch: ${item.id.slice(0, 8).toUpperCase()}.`);
    setTab("bookings"); void refreshAppointments();
  }
  function updated(next: User, voucher?: Voucher) {
    onUserUpdated(next);
    if (voucher) setVouchers((items) => [...items, voucher]);
  }
  async function markRead(id: string) {
    try { await api(`/notifications/${id}/read`, { method: "PATCH" });
      setNotifications((items) => items.map((item) => item.id === id ? { ...item, read: true } : item));
    } catch { /* Giữ thông báo chưa đọc để thử lại. */ }
  }
  const tabs: { id: Tab; icon: string; label: string }[] = [
    { id: "home", icon: "⌂", label: "Trang chủ" }, { id: "book", icon: "✂", label: "Đặt lịch" },
    { id: "bookings", icon: "◷", label: "Lịch của tôi" }, { id: "ai", icon: "✦", label: "Tư vấn" },
    { id: "profile", icon: "◉", label: "Hồ sơ" }
  ];
  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <View style={{ flex: 1 }}><Page key={tab}>
      {!!message && <Card style={{ borderColor: colors.gold }}><Text style={styles.text}>{message}</Text></Card>}
      <ErrorText message={error} />{loading && <Loading />}
      {tab === "home" && <CustomerHome name={user.name} services={services} barbers={barbers} appointments={appointments} vouchers={vouchers} notifications={notifications}
        onBook={openBook} onBookings={() => setTab("bookings")} onNotifications={() => setTab("notifications")} />}
      {tab === "book" && <CustomerBooking key={bookingKey} services={services} barbers={barbers} vouchers={vouchers} user={user} preset={preset} onBooked={booked} onUserUpdated={updated} />}
      {tab === "bookings" && <CustomerBookings appointments={appointments} onChanged={refreshAppointments} onRebook={openBook} />}
      {tab === "ai" && <Consultation onBookWithHaircut={(name, note, serviceName) => {
        const service = services.find((item) => serviceName && item.name.toLowerCase().includes(serviceName.toLowerCase())) || services.find((item) => item.id === "cut");
        openBook({ serviceIds: service ? [service.id] : [], styleName: name, note });
      }} />}
      {tab === "profile" && <CustomerProfile user={user} appointments={appointments} vouchers={vouchers} onUserUpdated={updated} onLogout={onLogout} />}
      {tab === "notifications" && <View style={{ gap: 8 }}><Text style={styles.subtitle}>Thông báo</Text><Button title="Quay lại" secondary onPress={() => setTab("home")} />
        {!notifications.length && <Card><Text style={styles.muted}>Chưa có thông báo.</Text></Card>}
        {notifications.map((item) => <Pressable key={item.id} onPress={() => void markRead(item.id)} style={[styles.card, !item.read && { borderColor: colors.gold }]}><Text style={styles.text}>{item.title}</Text><Text style={styles.muted}>{item.body}</Text><Text style={styles.muted}>{item.read ? "Đã đọc" : "Chạm để đánh dấu đã đọc"}</Text></Pressable>)}
      </View>}
    </Page></View>
    <SafeAreaView style={{ backgroundColor: colors.dark, borderTopWidth: 1, borderColor: colors.border }}><View style={{ flexDirection: "row", maxWidth: 920, alignSelf: "center", width: "100%", paddingVertical: 7, paddingHorizontal: 8 }}>
      {tabs.map((item) => <Pressable key={item.id} onPress={() => item.id === "book" ? openBook() : (setTab(item.id), setMessage(""))} style={{ flex: 1, alignItems: "center", paddingVertical: 5, borderRadius: 11, backgroundColor: tab === item.id ? colors.card : "transparent" }}><Text style={{ color: tab === item.id ? colors.gold : colors.muted, fontSize: 21 }}>{item.icon}</Text><Text style={{ color: tab === item.id ? colors.gold : colors.muted, fontSize: 10 }}>{item.label}</Text></Pressable>)}
    </View></SafeAreaView>
  </View>;
}
