import React, { useEffect, useState } from "react";
import { View, Text, Pressable, Alert } from "react-native";
import { api, ApiError } from "./api";
import {
  Barber,
  HairService,
  Appointment,
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

interface CustomerProps {
  user: User;
  onLogout: () => void;
  onUserUpdated: (user: User) => void;
}

export function Customer({ user, onLogout, onUserUpdated }: CustomerProps) {
  const [activeTab, setActiveTab] = useState<"book" | "history" | "profile">("book");
  const [services, setServices] = useState<HairService[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  // Booking state
  const [selectedService, setSelectedService] = useState<HairService | null>(null);
  const [selectedBarber, setSelectedBarber] = useState<Barber | null>(null);
  const [selectedDateOffset, setSelectedDateOffset] = useState<number>(0);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  // Profile edit state
  const [editName, setEditName] = useState(user.name);

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
      if (servicesData.length > 0) setSelectedService(servicesData[0]);
      if (barbersData.length > 0) setSelectedBarber(barbersData[0]);
    } catch (err: any) {
      setError(err.message || "Không thể tải dữ liệu.");
    } finally {
      setLoading(false);
    }
  }

  // Load available slots whenever barber, service, or date changes
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

  async function handleBook() {
    if (!selectedBarber || !selectedService || !selectedSlot) {
      setError("Vui lòng chọn thợ, dịch vụ và khung giờ.");
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
      Alert.alert("Thành công", "Đã đặt lịch hẹn thành công!");
      // Reload appointments & slots
      const myAppointments = await api<Appointment[]>("/appointments/me");
      setAppointments(myAppointments);
      setActiveTab("history");
      loadSlots(selectedBarber.id, selectedService.id, selectedDateOffset);
    } catch (err: any) {
      setError(err.message || "Đặt lịch thất bại.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(id: string) {
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

  async function handleSaveProfile() {
    setLoading(true);
    setError("");
    try {
      const updated = await api<User>("/me", {
        method: "PATCH",
        body: { name: editName }
      });
      onUserUpdated(updated);
      Alert.alert("Thành công", "Đã cập nhật thông tin!");
    } catch (err: any) {
      setError(err.message || "Không thể cập nhật hồ sơ.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Page>
      {/* Header Tabs */}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
        <Pressable
          onPress={() => setActiveTab("book")}
          style={[
            styles.button,
            activeTab !== "book" && styles.buttonSecondary,
            { flex: 1, paddingVertical: 10 }
          ]}
        >
          <Text style={[styles.buttonText, activeTab !== "book" && { color: colors.text }]}>
            Đặt lịch
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab("history")}
          style={[
            styles.button,
            activeTab !== "history" && styles.buttonSecondary,
            { flex: 1, paddingVertical: 10 }
          ]}
        >
          <Text style={[styles.buttonText, activeTab !== "history" && { color: colors.text }]}>
            Lịch hẹn ({appointments.length})
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab("profile")}
          style={[
            styles.button,
            activeTab !== "profile" && styles.buttonSecondary,
            { flex: 1, paddingVertical: 10 }
          ]}
        >
          <Text style={[styles.buttonText, activeTab !== "profile" && { color: colors.text }]}>
            Hồ sơ
          </Text>
        </Pressable>
      </View>

      <ErrorText message={error} />
      {loading && <Loading />}

      {/* TAB 1: BOOKING */}
      {activeTab === "book" && (
        <View style={{ gap: 14 }}>
          {/* Select Service */}
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
                  Thời gian: {svc.durationMinutes} phút
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Select Barber */}
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

          {/* Select Date */}
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

          {/* Select Slot */}
          <Text style={styles.subtitle}>4. Khung giờ còn trống</Text>
          {slotsLoading ? (
            <Loading />
          ) : availableSlots.length === 0 ? (
            <Card>
              <Text style={styles.muted}>Không có khung giờ trống trong ngày này.</Text>
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

          {/* Booking Summary & Confirm */}
          {selectedSlot && selectedService && selectedBarber && (
            <Card>
              <Text style={[styles.subtitle, { color: colors.gold }]}>Thông tin đặt lịch</Text>
              <Text style={styles.text}>Dịch vụ: {selectedService.name}</Text>
              <Text style={styles.text}>Thợ: {selectedBarber.name}</Text>
              <Text style={styles.text}>Thời gian: {dateTimeLabel(selectedSlot)}</Text>
              <Text style={styles.text}>Giá dự kiến: {money(selectedService.price)}</Text>
              <View style={{ marginTop: 8 }}>
                <Button title="Xác nhận đặt lịch" onPress={handleBook} disabled={loading} />
              </View>
            </Card>
          )}
        </View>
      )}

      {/* TAB 2: HISTORY */}
      {activeTab === "history" && (
        <View style={{ gap: 12 }}>
          <Text style={styles.subtitle}>Lịch sử đặt hẹn của bạn</Text>
          {appointments.length === 0 ? (
            <Card>
              <Text style={styles.muted}>Bạn chưa có lịch hẹn nào.</Text>
            </Card>
          ) : (
            appointments.map((appt) => {
              const canCancel =
                (appt.status === "pending" || appt.status === "confirmed") &&
                new Date(appt.startAt).getTime() > Date.now();
              return (
                <Card key={appt.id}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={[styles.text, { fontWeight: "700" }]}>
                      {appt.serviceNameSnapshot}
                    </Text>
                    <Text
                      style={{
                        fontWeight: "700",
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
                  <Text style={styles.muted}>Thợ cắt: {appt.barberNameSnapshot}</Text>
                  <Text style={styles.text}>Bắt đầu: {dateTimeLabel(appt.startAt)}</Text>
                  <Text style={styles.muted}>Kết thúc: {timeLabel(appt.endAt)}</Text>
                  <Text style={[styles.text, { color: colors.gold }]}>
                    Giá: {money(appt.priceSnapshot)}
                  </Text>
                  {canCancel && (
                    <View style={{ marginTop: 6 }}>
                      <Button
                        title="Hủy lịch hẹn"
                        secondary
                        onPress={() => handleCancel(appt.id)}
                        disabled={loading}
                      />
                    </View>
                  )}
                </Card>
              );
            })
          )}
        </View>
      )}

      {/* TAB 3: PROFILE */}
      {activeTab === "profile" && (
        <View style={{ gap: 12 }}>
          <Text style={styles.subtitle}>Thông tin tài khoản</Text>
          <Card>
            <Field label="Họ và tên" value={editName} onChange={setEditName} />
            <View style={{ gap: 4 }}>
              <Text style={styles.muted}>Số điện thoại</Text>
              <Text style={styles.text}>{user.phone}</Text>
            </View>
            <View style={{ gap: 4 }}>
              <Text style={styles.muted}>Vai trò</Text>
              <Text style={styles.text}>Khách hàng</Text>
            </View>
            <Button
              title="Cập nhật họ tên"
              onPress={handleSaveProfile}
              disabled={loading || !editName.trim()}
            />
          </Card>
          <Button title="Đăng xuất" secondary onPress={onLogout} />
        </View>
      )}
    </Page>
  );
}

