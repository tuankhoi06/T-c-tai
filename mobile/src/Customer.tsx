import React, { useEffect, useState } from "react";
import { View, Text, Pressable, Alert, ScrollView, SafeAreaView } from "react-native";
import { api, ApiError } from "./api";
import {
  Barber,
  HairService,
  Appointment,
  AppointmentStatus,
  User
} from "./types";
import {
  Button,
  Card,
  dateTimeLabel,
  ErrorText,
  Field,
  Loading,
  money,
  Page,
  shopDate,
  statusLabel,
  styles,
  timeLabel,
  colors
} from "./ui";
import { Consultation } from "./Consultation";

interface CustomerProps {
  user: User;
  onLogout: () => void;
  onUserUpdated: (user: User) => void;
}

export function Customer({ user, onLogout, onUserUpdated }: CustomerProps) {
  // 4 main navigation tabs requested in specification: Trang chủ, AI tư vấn, Lịch hẹn, Hồ sơ
  const [navTab, setNavTab] = useState<"home" | "ai" | "appointments" | "profile">("home");

  // Sub-view inside 'appointments': 'book' vs 'history'
  const [appointmentView, setAppointmentView] = useState<"book" | "history">("book");
  // Status filter for appointment history
  const [historyFilter, setHistoryFilter] = useState<"all" | AppointmentStatus>("all");

  // Data states
  const [services, setServices] = useState<HairService[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  // Booking states
  const [selectedService, setSelectedService] = useState<HairService | null>(null);
  const [selectedBarber, setSelectedBarber] = useState<Barber | null>(null);
  const [selectedDateOffset, setSelectedDateOffset] = useState<number>(0);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  // AI transition state
  const [aiHaircutSuggestion, setAiHaircutSuggestion] = useState<{
    name: string;
    barberNote: string;
  } | null>(null);

  // Profile edit state
  const [editName, setEditName] = useState(user.name);

  // Loading & error states
  const [loading, setLoading] = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    setLoading(true);
    setError("");
    try {
      const [servicesData, barbersData, myAppointments] = await Promise.all([
        api<HairService[]>("/services"),
        api<Barber[]>("/barbers"),
        api<Appointment[]>("/appointments/me")
      ]);
      setServices(servicesData);
      setBarbers(barbersData);
      setAppointments(myAppointments);
      if (servicesData.length > 0 && !selectedService) setSelectedService(servicesData[0]);
      if (barbersData.length > 0 && !selectedBarber) setSelectedBarber(barbersData[0]);
    } catch (err: any) {
      setError(err.message || "Không thể tải dữ liệu từ máy chủ.");
    } finally {
      setLoading(false);
    }
  }

  // Reload available slots whenever barber, service, or date changes
  useEffect(() => {
    if (selectedBarber && selectedService) {
      loadSlots(selectedBarber.id, selectedService.id, selectedDateOffset);
    }
  }, [selectedBarber, selectedService, selectedDateOffset]);

  async function loadSlots(barberId: string, serviceId: string, offset: number) {
    setSlotsLoading(true);
    setSelectedSlot(null);
    try {
      const date = shopDate(offset);
      const slots = await api<string[]>(
        `/availability?barberId=${barberId}&serviceId=${serviceId}&date=${date}`
      );
      setAvailableSlots(slots);
    } catch {
      setAvailableSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }

  // Handle transition from AI Consultation to Booking
  function handleBookWithAiHaircut(haircutName: string, barberNote: string, suggestedService?: string) {
    setAiHaircutSuggestion({ name: haircutName, barberNote });
    let matchedSvc = services.find((s) =>
      suggestedService && s.name.toLowerCase().includes(suggestedService.toLowerCase())
    );
    if (!matchedSvc && suggestedService) {
      if (suggestedService.includes("Uốn") || haircutName.includes("Uốn")) {
        matchedSvc = services.find((s) => s.id === "perm" || s.name.includes("Uốn"));
      } else if (suggestedService.includes("Nhuộm") || haircutName.includes("Nhuộm")) {
        matchedSvc = services.find((s) => s.id === "dye" || s.name.includes("Nhuộm"));
      }
    }
    if (!matchedSvc) {
      matchedSvc = services.find((s) => s.id === "cut") || services[0];
    }
    if (matchedSvc) setSelectedService(matchedSvc);
    setAppointmentView("book");
    setNavTab("appointments");
  }

  // Quick select service from Home
  function handleSelectServiceFromHome(svc: HairService) {
    setSelectedService(svc);
    setAppointmentView("book");
    setNavTab("appointments");
  }

  // Quick select barber from Home
  function handleSelectBarberFromHome(barber: Barber) {
    setSelectedBarber(barber);
    setAppointmentView("book");
    setNavTab("appointments");
  }

  async function handleBook() {
    if (!selectedBarber || !selectedService || !selectedSlot) {
      setError("Vui lòng chọn thợ, dịch vụ và khung giờ hợp lệ.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await api<Appointment>("/appointments", {
        method: "POST",
        body: {
          barberId: selectedBarber.id,
          serviceId: selectedService.id,
          startAt: selectedSlot
        }
      });
      Alert.alert(
        "Đặt lịch thành công!",
        `Lịch hẹn của bạn vào ${dateTimeLabel(selectedSlot)} đã được ghi nhận và đang chờ thợ xác nhận.`
      );
      // Reload appointments & slots
      const myAppointments = await api<Appointment[]>("/appointments/me");
      setAppointments(myAppointments);
      setAppointmentView("history");
      setAiHaircutSuggestion(null);
      loadSlots(selectedBarber.id, selectedService.id, selectedDateOffset);
    } catch (err: any) {
      setError(err.message || "Đặt lịch thất bại.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(id: string) {
    Alert.alert(
      "Xác nhận hủy lịch",
      "Bạn có chắc chắn muốn hủy lịch hẹn này?",
      [
        { text: "Không", style: "cancel" },
        {
          text: "Hủy lịch ngay",
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            setError("");
            try {
              await api<Appointment>(`/appointments/${id}/cancel`, {
                method: "PATCH"
              });
              const myAppointments = await api<Appointment[]>("/appointments/me");
              setAppointments(myAppointments);
              Alert.alert("Thông báo", "Đã hủy lịch hẹn thành công.");
            } catch (err: any) {
              setError(err.message || "Không thể hủy lịch.");
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  }

  async function handleSaveProfile() {
    if (!editName.trim()) {
      setError("Họ tên không được để trống.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const updated = await api<User>("/me", {
        method: "PATCH",
        body: { name: editName.trim() }
      });
      onUserUpdated(updated);
      Alert.alert("Thành công", "Đã cập nhật thông tin cá nhân!");
    } catch (err: any) {
      setError(err.message || "Không thể cập nhật hồ sơ.");
    } finally {
      setLoading(false);
    }
  }

  // Filtered appointment history
  const filteredAppointments = appointments.filter((appt) => {
    if (historyFilter === "all") return true;
    return appt.status === historyFilter;
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Main Content Area */}
      <View style={{ flex: 1 }}>
        {/* ===================== TAB 1: TRANG CHỦ ===================== */}
        {navTab === "home" && (
          <Page>
            {/* Header Greeting */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View>
                <Text style={[styles.subtitle, { color: colors.gold, fontSize: 22 }]}>HairMatch</Text>
                <Text style={styles.text}>Xin chào, <Text style={{ fontWeight: "700" }}>{user.name}</Text> 👋</Text>
              </View>
              <Pressable
                onPress={() => setNavTab("profile")}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: "#2a2a2a",
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: colors.border
                }}
              >
                <Text style={{ fontSize: 16 }}>👤</Text>
              </Pressable>
            </View>

            {/* Hero Banner */}
            <Card style={{ backgroundColor: "#1e1b13", borderColor: colors.gold, borderWidth: 1 }}>
              <Text style={[styles.subtitle, { color: colors.gold, fontSize: 17 }]}>
                ✂️ HairMatch Barbershop
              </Text>
              <Text style={[styles.text, { fontSize: 13, marginTop: 2 }]}>
                Đẳng cấp phong độ & Nâng tầm diện mạo phái mạnh. Đặt lịch nhanh chóng, không lo chờ đợi!
              </Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    title="✂️ Đặt lịch ngay"
                    onPress={() => {
                      setAppointmentView("book");
                      setNavTab("appointments");
                    }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    title="✨ AI Tư vấn"
                    secondary
                    onPress={() => setNavTab("ai")}
                  />
                </View>
              </View>
            </Card>

            <ErrorText message={error} />
            {loading && <Loading />}

            {/* Service Highlights */}
            <View style={{ gap: 10, marginTop: 4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={styles.subtitle}>Bảng giá dịch vụ</Text>
                <Pressable onPress={() => { setAppointmentView("book"); setNavTab("appointments"); }}>
                  <Text style={{ color: colors.gold, fontSize: 13, fontWeight: "600" }}>Xem tất cả & đặt →</Text>
                </Pressable>
              </View>

              {services.length === 0 && !loading && (
                <Card>
                  <Text style={styles.muted}>Chưa có dịch vụ nào.</Text>
                </Card>
              )}

              {services.map((svc) => (
                <Pressable
                  key={svc.id}
                  onPress={() => handleSelectServiceFromHome(svc)}
                  style={[styles.card, { paddingVertical: 12 }]}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={[styles.text, { fontWeight: "700", fontSize: 15 }]}>{svc.name}</Text>
                    <Text style={[styles.text, { color: colors.gold, fontWeight: "700" }]}>
                      {money(svc.price)}
                    </Text>
                  </View>
                  <Text style={[styles.muted, { marginTop: 2, fontSize: 13 }]}>{svc.description}</Text>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                    <Text style={[styles.muted, { fontSize: 12 }]}>⏱ {svc.durationMinutes} phút</Text>
                    <Text style={{ color: colors.gold, fontSize: 12, fontWeight: "600" }}>Đặt dịch vụ này ➔</Text>
                  </View>
                </Pressable>
              ))}
            </View>

            {/* Barbers Team */}
            <View style={{ gap: 10, marginTop: 8 }}>
              <Text style={styles.subtitle}>Đội ngũ Barber tài năng</Text>
              <View style={{ gap: 8 }}>
                {barbers.map((barber) => (
                  <Pressable
                    key={barber.id}
                    onPress={() => handleSelectBarberFromHome(barber)}
                    style={[styles.card, { flexDirection: "row", alignItems: "center", gap: 12 }]}
                  >
                    <View
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 24,
                        backgroundColor: "#2e2e2e",
                        alignItems: "center",
                        justifyContent: "center",
                        borderWidth: 1,
                        borderColor: colors.gold
                      }}
                    >
                      <Text style={{ fontSize: 22 }}>💈</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.text, { fontWeight: "700" }]}>{barber.name}</Text>
                      <Text style={[styles.muted, { fontSize: 13 }]}>{barber.bio}</Text>
                    </View>
                    <Text style={{ color: colors.gold, fontSize: 12, fontWeight: "600" }}>Chọn thợ ➔</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Salon Info */}
            <Card style={{ marginTop: 8 }}>
              <Text style={[styles.subtitle, { fontSize: 15, color: colors.gold }]}>Thông tin tiệm tóc</Text>
              <Text style={styles.text}>📍 Địa chỉ: 123 Đường Cắt Tóc, Phường Bến Nghé, Quận 1, TP. HCM</Text>
              <Text style={styles.text}>⏰ Giờ mở cửa: 09:00 - 19:00 (Hàng ngày)</Text>
              <Text style={styles.text}>📞 Hotline hỗ trợ: 1900 6868</Text>
            </Card>
          </Page>
        )}

        {/* ===================== TAB 2: AI TƯ VẤN ===================== */}
        {navTab === "ai" && (
          <Consultation onBookWithHaircut={handleBookWithAiHaircut} />
        )}

        {/* ===================== TAB 3: LỊCH HẸN & ĐẶT LỊCH ===================== */}
        {navTab === "appointments" && (
          <Page>
            {/* Sub-view switcher: Book vs History */}
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
              <Pressable
                onPress={() => setAppointmentView("book")}
                style={[
                  styles.button,
                  appointmentView !== "book" && styles.buttonSecondary,
                  { flex: 1, paddingVertical: 10 }
                ]}
              >
                <Text style={[styles.buttonText, appointmentView !== "book" && { color: colors.text }]}>
                  ✂️ Đặt lịch mới
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setAppointmentView("history")}
                style={[
                  styles.button,
                  appointmentView !== "history" && styles.buttonSecondary,
                  { flex: 1, paddingVertical: 10 }
                ]}
              >
                <Text style={[styles.buttonText, appointmentView !== "history" && { color: colors.text }]}>
                  📋 Lịch của tôi ({appointments.length})
                </Text>
              </Pressable>
            </View>

            <ErrorText message={error} />
            {loading && <Loading />}

            {/* --- SUB-VIEW 1: BOOKING FLOW --- */}
            {appointmentView === "book" && (
              <View style={{ gap: 14 }}>
                {/* AI Haircut Banner if redirected from AI */}
                {aiHaircutSuggestion && (
                  <Card style={{ backgroundColor: "#201c10", borderColor: colors.gold, borderWidth: 1 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={[styles.subtitle, { color: colors.gold, fontSize: 15 }]}>
                        ✨ Kiểu tóc gợi ý từ AI
                      </Text>
                      <Pressable onPress={() => setAiHaircutSuggestion(null)}>
                        <Text style={[styles.muted, { fontSize: 12 }]}>Bỏ chọn ✕</Text>
                      </Pressable>
                    </View>
                    <Text style={[styles.text, { fontWeight: "700" }]}>{aiHaircutSuggestion.name}</Text>
                    <Text style={[styles.muted, { fontSize: 13 }]}>
                      Lưu ý trao đổi với thợ: {aiHaircutSuggestion.barberNote}
                    </Text>
                  </Card>
                )}

                {/* Step 1: Select Service */}
                <Text style={styles.subtitle}>1. Chọn dịch vụ</Text>
                <View style={{ gap: 8 }}>
                  {services.map((svc) => (
                    <Pressable
                      key={svc.id}
                      onPress={() => setSelectedService(svc)}
                      style={[
                        styles.card,
                        selectedService?.id === svc.id && { borderColor: colors.gold, borderWidth: 2 }
                      ]}
                    >
                      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Text style={[styles.text, { fontWeight: "700" }]}>{svc.name}</Text>
                        <Text style={[styles.text, { color: colors.gold, fontWeight: "700" }]}>
                          {money(svc.price)}
                        </Text>
                      </View>
                      <Text style={styles.muted}>{svc.description}</Text>
                      <Text style={[styles.muted, { fontSize: 12 }]}>
                        Thời gian thực hiện: {svc.durationMinutes} phút
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {/* Step 2: Select Barber */}
                <Text style={styles.subtitle}>2. Chọn thợ tóc</Text>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  {barbers.map((barber) => (
                    <Pressable
                      key={barber.id}
                      onPress={() => setSelectedBarber(barber)}
                      style={[
                        styles.card,
                        { flex: 1 },
                        selectedBarber?.id === barber.id && {
                          borderColor: colors.gold,
                          borderWidth: 2
                        }
                      ]}
                    >
                      <Text style={[styles.text, { fontWeight: "700" }]}>{barber.name}</Text>
                      <Text style={[styles.muted, { fontSize: 13 }]}>{barber.bio}</Text>
                    </Pressable>
                  ))}
                </View>

                {/* Step 3: Select Date */}
                <Text style={styles.subtitle}>3. Chọn ngày</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {[0, 1, 2, 3, 4].map((offset) => {
                    const d = shopDate(offset);
                    const label = offset === 0 ? "Hôm nay" : offset === 1 ? "Ngày mai" : `+${offset} ngày`;
                    return (
                      <Pressable
                        key={offset}
                        onPress={() => setSelectedDateOffset(offset)}
                        style={[
                          styles.button,
                          selectedDateOffset !== offset && styles.buttonSecondary,
                          { flex: 1, paddingVertical: 10, paddingHorizontal: 4 }
                        ]}
                      >
                        <Text
                          style={[
                            styles.buttonText,
                            { fontSize: 12 },
                            selectedDateOffset !== offset && { color: colors.text }
                          ]}
                        >
                          {label}
                        </Text>
                        <Text
                          style={[
                            styles.muted,
                            { fontSize: 10 },
                            selectedDateOffset === offset && { color: "#111" }
                          ]}
                        >
                          {d.slice(5)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Step 4: Select Slot */}
                <Text style={styles.subtitle}>4. Khung giờ còn trống</Text>
                {slotsLoading ? (
                  <Loading />
                ) : availableSlots.length === 0 ? (
                  <Card>
                    <Text style={styles.muted}>Không có khung giờ trống trong ngày này hoặc đã qua giờ làm việc.</Text>
                  </Card>
                ) : (
                  <View style={styles.row}>
                    {availableSlots.map((slot) => {
                      const isSelected = selectedSlot === slot;
                      return (
                        <Pressable
                          key={slot}
                          onPress={() => setSelectedSlot(slot)}
                          style={[
                            styles.card,
                            {
                              paddingVertical: 10,
                              paddingHorizontal: 14,
                              minWidth: 80,
                              alignItems: "center"
                            },
                            isSelected && {
                              backgroundColor: colors.gold,
                              borderColor: colors.gold
                            }
                          ]}
                        >
                          <Text
                            style={[
                              styles.text,
                              { fontWeight: "700" },
                              isSelected && { color: "#111" }
                            ]}
                          >
                            {timeLabel(slot)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                {/* Step 5: Booking Confirmation Card */}
                {selectedSlot && selectedService && selectedBarber && (
                  <Card style={{ borderColor: colors.gold, borderWidth: 1 }}>
                    <Text style={[styles.subtitle, { color: colors.gold }]}>Xác nhận thông tin đặt lịch</Text>
                    {aiHaircutSuggestion && (
                      <Text style={[styles.text, { color: colors.gold }]}>
                        Kiểu tóc AI: {aiHaircutSuggestion.name}
                      </Text>
                    )}
                    <Text style={styles.text}>Dịch vụ: {selectedService.name}</Text>
                    <Text style={styles.text}>Thợ cắt: {selectedBarber.name}</Text>
                    <Text style={styles.text}>Thời gian bắt đầu: {dateTimeLabel(selectedSlot)}</Text>
                    <Text style={styles.text}>Giá dự kiến: {money(selectedService.price)}</Text>
                    <View style={{ marginTop: 10 }}>
                      <Button title="Xác nhận đặt lịch" onPress={handleBook} disabled={loading} />
                    </View>
                  </Card>
                )}
              </View>
            )}

            {/* --- SUB-VIEW 2: APPOINTMENT HISTORY --- */}
            {appointmentView === "history" && (
              <View style={{ gap: 12 }}>
                {/* Status Filter Buttons */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {(["all", "pending", "confirmed", "completed", "cancelled"] as const).map((filterKey) => {
                    const label =
                      filterKey === "all"
                        ? "Tất cả"
                        : statusLabel[filterKey] || filterKey;
                    const isActive = historyFilter === filterKey;
                    return (
                      <Pressable
                        key={filterKey}
                        onPress={() => setHistoryFilter(filterKey)}
                        style={[
                          styles.button,
                          !isActive && styles.buttonSecondary,
                          { paddingVertical: 6, paddingHorizontal: 12 }
                        ]}
                      >
                        <Text style={[styles.buttonText, { fontSize: 12 }, !isActive && { color: colors.text }]}>
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {/* Appointment List / Empty State */}
                {filteredAppointments.length === 0 ? (
                  <Card style={{ alignItems: "center", paddingVertical: 30, gap: 10 }}>
                    <Text style={{ fontSize: 36 }}>📅</Text>
                    <Text style={[styles.subtitle, { fontSize: 16 }]}>Chưa có lịch hẹn nào</Text>
                    <Text style={[styles.muted, { textAlign: "center" }]}>
                      {historyFilter === "all"
                        ? "Bạn chưa đặt lịch hẹn nào. Hãy chọn dịch vụ và đặt ngay để được phục vụ tốt nhất!"
                        : `Không có lịch hẹn nào ở trạng thái "${statusLabel[historyFilter as AppointmentStatus] || historyFilter}".`}
                    </Text>
                    <Button
                      title="✂️ Đặt lịch ngay"
                      onPress={() => setAppointmentView("book")}
                    />
                  </Card>
                ) : (
                  filteredAppointments.map((appt) => {
                    const isWithinOneDay = appt.createdAt
                      ? Date.now() - new Date(appt.createdAt).getTime() <= 24 * 60 * 60 * 1000
                      : true;
                    const canCancel =
                      appt.status === "pending" &&
                      isWithinOneDay &&
                      new Date(appt.startAt).getTime() > Date.now();
                    return (
                      <Card key={appt.id}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                          <Text style={[styles.text, { fontWeight: "700", fontSize: 16 }]}>
                            {appt.serviceNameSnapshot}
                          </Text>
                          <Text
                            style={{
                              fontWeight: "700",
                              fontSize: 13,
                              color:
                                appt.status === "confirmed"
                                  ? colors.gold
                                  : appt.status === "completed"
                                  ? "#4ade80"
                                  : appt.status === "cancelled"
                                  ? colors.danger
                                  : colors.muted
                            }}
                          >
                            {statusLabel[appt.status] || appt.status}
                          </Text>
                        </View>
                        <Text style={styles.muted}>Thợ cắt tóc: {appt.barberNameSnapshot}</Text>
                        <Text style={styles.text}>Thời gian bắt đầu: {dateTimeLabel(appt.startAt)}</Text>
                        <Text style={styles.muted}>Dự kiến kết thúc: {timeLabel(appt.endAt)}</Text>
                        <Text style={[styles.text, { color: colors.gold, fontWeight: "700" }]}>
                          Giá: {money(appt.priceSnapshot)}
                        </Text>
                        {canCancel ? (
                          <View style={{ marginTop: 8 }}>
                            <Button
                              title="Hủy lịch hẹn"
                              secondary
                              onPress={() => handleCancel(appt.id)}
                              disabled={loading}
                            />
                          </View>
                        ) : appt.status === "confirmed" ? (
                          <Text style={[styles.muted, { fontSize: 12, color: colors.gold, marginTop: 6 }]}>
                            🔒 Lịch đã được Admin duyệt (Không thể tự hủy. Vui lòng liên hệ hotline nếu cần đổi)
                          </Text>
                        ) : appt.status === "pending" && !isWithinOneDay ? (
                          <Text style={[styles.muted, { fontSize: 12, color: colors.muted, marginTop: 6 }]}>
                            ⏳ Đã quá thời hạn 1 ngày kể từ khi đặt lịch (Không thể tự hủy)
                          </Text>
                        ) : null}
                      </Card>
                    );
                  })
                )}

                {/* Retry / Refresh */}
                <View style={{ marginTop: 6 }}>
                  <Button title="🔄 Tải lại dữ liệu" secondary onPress={loadInitialData} disabled={loading} />
                </View>
              </View>
            )}
          </Page>
        )}

        {/* ===================== TAB 4: HỒ SƠ ===================== */}
        {navTab === "profile" && (
          <Page>
            <Text style={styles.title}>Hồ sơ cá nhân</Text>
            <Text style={styles.muted}>Quản lý thông tin tài khoản và đăng xuất an toàn</Text>

            <ErrorText message={error} />
            {loading && <Loading />}

            <Card>
              <Text style={[styles.subtitle, { color: colors.gold }]}>Thông tin khách hàng</Text>
              <Field label="Họ và tên" value={editName} onChange={setEditName} />
              <View style={{ gap: 4, marginVertical: 4 }}>
                <Text style={styles.muted}>Số điện thoại</Text>
                <Text style={styles.text}>{user.phone || "(Chưa cập nhật)"}</Text>
              </View>
              <View style={{ gap: 4, marginVertical: 4 }}>
                <Text style={styles.muted}>Email</Text>
                <Text style={styles.text}>{user.email || "(Chưa cập nhật)"}</Text>
              </View>
              <View style={{ gap: 4, marginVertical: 4 }}>
                <Text style={styles.muted}>Vai trò</Text>
                <Text style={styles.text}>Khách hàng thân thiết</Text>
              </View>
              <View style={{ marginTop: 8 }}>
                <Button
                  title="Cập nhật họ tên"
                  onPress={handleSaveProfile}
                  disabled={loading || !editName.trim()}
                />
              </View>
            </Card>

            <Card>
              <Text style={[styles.subtitle, { fontSize: 15, color: colors.gold }]}>Chính sách salon</Text>
              <Text style={[styles.muted, { fontSize: 13 }]}>
                • Bạn có thể hủy lịch miễn phí trước giờ bắt đầu của lịch hẹn.{"\n"}
                • Múi giờ đặt lịch tiêu chuẩn là Asia/Ho_Chi_Minh.{"\n"}
                • Mọi thông tin tư vấn kiểu tóc từ AI mang tính tham khảo để trao đổi cùng thợ.
              </Text>
            </Card>

            <Button title="🚪 Đăng xuất tài khoản" secondary onPress={onLogout} />
          </Page>
        )}
      </View>

      {/* ===================== BOTTOM NAVIGATION BAR ===================== */}
      <SafeAreaView style={{ backgroundColor: "#141414", borderTopWidth: 1, borderColor: colors.border }}>
        <View style={{ flexDirection: "row", justifyContent: "space-around", paddingVertical: 8 }}>
          <Pressable
            onPress={() => setNavTab("home")}
            style={{ alignItems: "center", flex: 1, paddingVertical: 4 }}
          >
            <Text style={{ fontSize: 20 }}>🏠</Text>
            <Text
              style={{
                fontSize: 11,
                fontWeight: navTab === "home" ? "700" : "500",
                color: navTab === "home" ? colors.gold : colors.muted,
                marginTop: 2
              }}
            >
              Trang chủ
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setNavTab("ai")}
            style={{ alignItems: "center", flex: 1, paddingVertical: 4 }}
          >
            <Text style={{ fontSize: 20 }}>✨</Text>
            <Text
              style={{
                fontSize: 11,
                fontWeight: navTab === "ai" ? "700" : "500",
                color: navTab === "ai" ? colors.gold : colors.muted,
                marginTop: 2
              }}
            >
              AI Tư vấn
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setNavTab("appointments")}
            style={{ alignItems: "center", flex: 1, paddingVertical: 4 }}
          >
            <Text style={{ fontSize: 20 }}>📅</Text>
            <Text
              style={{
                fontSize: 11,
                fontWeight: navTab === "appointments" ? "700" : "500",
                color: navTab === "appointments" ? colors.gold : colors.muted,
                marginTop: 2
              }}
            >
              Lịch hẹn
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setNavTab("profile")}
            style={{ alignItems: "center", flex: 1, paddingVertical: 4 }}
          >
            <Text style={{ fontSize: 20 }}>👤</Text>
            <Text
              style={{
                fontSize: 11,
                fontWeight: navTab === "profile" ? "700" : "500",
                color: navTab === "profile" ? colors.gold : colors.muted,
                marginTop: 2
              }}
            >
              Hồ sơ
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}
