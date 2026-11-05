import React, { useEffect, useState } from "react";
import { View, Text, Pressable, Alert } from "react-native";
import { api } from "./api";
import {
  Appointment,
  AppointmentStatus,
  Barber,
  HairService,
  Statistics,
  User,
  WorkSchedule
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

interface AdminProps {
  user: User;
  onLogout: () => void;
}

export function Admin({ user, onLogout }: AdminProps) {
  const [activeTab, setActiveTab] = useState<"stats" | "appointments" | "services" | "barbers" | "schedules">("stats");

  const [stats, setStats] = useState<Statistics | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [services, setServices] = useState<HairService[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [schedules, setSchedules] = useState<WorkSchedule[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Create Service Form state
  const [newSvcName, setNewSvcName] = useState("");
  const [newSvcDesc, setNewSvcDesc] = useState("");
  const [newSvcPrice, setNewSvcPrice] = useState("100000");
  const [newSvcDuration, setNewSvcDuration] = useState("30");

  // Create Barber Form state
  const [newBarberName, setNewBarberName] = useState("");
  const [newBarberBio, setNewBarberBio] = useState("");

  // Create Schedule Form state
  const [newSchedBarberId, setNewSchedBarberId] = useState("");
  const [newSchedDate, setNewSchedDate] = useState(shopDate(0));
  const [newSchedStart, setNewSchedStart] = useState("09:00");
  const [newSchedEnd, setNewSchedEnd] = useState("18:00");

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      const [st, appts, svcs, brbs, schs] = await Promise.all([
        api<Statistics>("/admin/statistics"),
        api<Appointment[]>("/admin/appointments"),
        api<HairService[]>("/admin/services"),
        api<Barber[]>("/admin/barbers"),
        api<WorkSchedule[]>("/admin/work-schedules")
      ]);
      setStats(st);
      setAppointments(appts);
      setServices(svcs);
      setBarbers(brbs);
      setSchedules(schs);
      if (brbs.length > 0 && !newSchedBarberId) {
        setNewSchedBarberId(brbs[0].id);
      }
    } catch (err: any) {
      setError(err.message || "Không thể tải dữ liệu quản trị.");
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange(id: string, status: AppointmentStatus) {
    setLoading(true);
    setError("");
    try {
      await api<Appointment>(`/admin/appointments/${id}/status`, {
        method: "PATCH",
        body: { status }
      });
      loadAll();
    } catch (err: any) {
      setError(err.message || "Chuyển trạng thái thất bại.");
      setLoading(false);
    }
  }

  async function handleCreateService() {
    if (!newSvcName.trim()) {
      setError("Vui lòng nhập tên dịch vụ.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await api<HairService>("/admin/services", {
        method: "POST",
        body: {
          name: newSvcName.trim(),
          description: newSvcDesc.trim(),
          price: parseInt(newSvcPrice, 10) || 0,
          durationMinutes: parseInt(newSvcDuration, 10) || 30,
          active: true
        }
      });
      setNewSvcName("");
      setNewSvcDesc("");
      loadAll();
    } catch (err: any) {
      setError(err.message || "Không thể tạo dịch vụ.");
      setLoading(false);
    }
  }

  async function handleDeactivateService(id: string) {
    setLoading(true);
    setError("");
    try {
      await api(`/admin/services/${id}`, { method: "DELETE" });
      loadAll();
    } catch (err: any) {
      setError(err.message || "Lỗi thao tác dịch vụ.");
      setLoading(false);
    }
  }

  async function handleCreateBarber() {
    if (!newBarberName.trim()) {
      setError("Vui lòng nhập tên thợ.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await api<Barber>("/admin/barbers", {
        method: "POST",
        body: {
          name: newBarberName.trim(),
          bio: newBarberBio.trim(),
          imageUrl: "",
          active: true
        }
      });
      setNewBarberName("");
      setNewBarberBio("");
      loadAll();
    } catch (err: any) {
      setError(err.message || "Không thể thêm thợ.");
      setLoading(false);
    }
  }

  async function handleDeactivateBarber(id: string) {
    setLoading(true);
    setError("");
    try {
      await api(`/admin/barbers/${id}`, { method: "DELETE" });
      loadAll();
    } catch (err: any) {
      setError(err.message || "Lỗi thao tác thợ.");
      setLoading(false);
    }
  }

  async function handleCreateSchedule() {
    if (!newSchedBarberId) {
      setError("Vui lòng chọn thợ.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await api<WorkSchedule>("/admin/work-schedules", {
        method: "POST",
        body: {
          barberId: newSchedBarberId,
          date: newSchedDate,
          startTime: newSchedStart,
          endTime: newSchedEnd
        }
      });
      Alert.alert("Thành công", "Đã tạo ca làm việc!");
      loadAll();
    } catch (err: any) {
      setError(err.message || "Không thể thêm lịch làm việc.");
      setLoading(false);
    }
  }

  async function handleDeleteSchedule(id: string) {
    setLoading(true);
    setError("");
    try {
      await api(`/admin/work-schedules/${id}`, { method: "DELETE" });
      loadAll();
    } catch (err: any) {
      setError(err.message || "Không thể xóa lịch làm việc.");
      setLoading(false);
    }
  }

  return (
    <Page>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={styles.title}>Quản trị tiệm</Text>
        <Button title="Đăng xuất" secondary onPress={onLogout} />
      </View>

      {/* Tabs */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        <Pressable
          onPress={() => setActiveTab("stats")}
          style={[styles.button, activeTab !== "stats" && styles.buttonSecondary, { paddingVertical: 8, paddingHorizontal: 12 }]}
        >
          <Text style={[styles.buttonText, { fontSize: 13 }, activeTab !== "stats" && { color: colors.text }]}>
            Thống kê
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab("appointments")}
          style={[styles.button, activeTab !== "appointments" && styles.buttonSecondary, { paddingVertical: 8, paddingHorizontal: 12 }]}
        >
          <Text style={[styles.buttonText, { fontSize: 13 }, activeTab !== "appointments" && { color: colors.text }]}>
            Lịch hẹn ({appointments.length})
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab("services")}
          style={[styles.button, activeTab !== "services" && styles.buttonSecondary, { paddingVertical: 8, paddingHorizontal: 12 }]}
        >
          <Text style={[styles.buttonText, { fontSize: 13 }, activeTab !== "services" && { color: colors.text }]}>
            Dịch vụ
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab("barbers")}
          style={[styles.button, activeTab !== "barbers" && styles.buttonSecondary, { paddingVertical: 8, paddingHorizontal: 12 }]}
        >
          <Text style={[styles.buttonText, { fontSize: 13 }, activeTab !== "barbers" && { color: colors.text }]}>
            Thợ tóc
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab("schedules")}
          style={[styles.button, activeTab !== "schedules" && styles.buttonSecondary, { paddingVertical: 8, paddingHorizontal: 12 }]}
        >
          <Text style={[styles.buttonText, { fontSize: 13 }, activeTab !== "schedules" && { color: colors.text }]}>
            Lịch làm việc
          </Text>
        </Pressable>
      </View>

      <ErrorText message={error} />
      {loading && <Loading />}

      {/* TAB 1: STATS */}
      {activeTab === "stats" && stats && (
        <View style={{ gap: 12 }}>
          <Text style={styles.subtitle}>Tổng quan tiệm tóc</Text>
          <Card>
            <Text style={styles.muted}>Doanh thu thực tế (đã hoàn thành)</Text>
            <Text style={[styles.title, { fontSize: 32 }]}>{money(stats.revenue)}</Text>
          </Card>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Card>
              <Text style={styles.muted}>Tổng lịch hẹn</Text>
              <Text style={[styles.subtitle, { color: colors.gold }]}>{stats.total}</Text>
            </Card>
            <Card>
              <Text style={styles.muted}>Chờ duyệt</Text>
              <Text style={[styles.subtitle, { color: "#facc15" }]}>{stats.pending}</Text>
            </Card>
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Card>
              <Text style={styles.muted}>Đã xác nhận</Text>
              <Text style={[styles.subtitle, { color: colors.gold }]}>{stats.confirmed}</Text>
            </Card>
            <Card>
              <Text style={styles.muted}>Đã hoàn thành</Text>
              <Text style={[styles.subtitle, { color: "#4ade80" }]}>{stats.completed}</Text>
            </Card>
          </View>
        </View>
      )}

      {/* TAB 2: APPOINTMENTS */}
      {activeTab === "appointments" && (
        <View style={{ gap: 12 }}>
          <Text style={styles.subtitle}>Danh sách lịch hẹn</Text>
          {appointments.length === 0 ? (
            <Card><Text style={styles.muted}>Chưa có lịch hẹn nào.</Text></Card>
          ) : (
            appointments.map((appt) => (
              <Card key={appt.id}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={[styles.text, { fontWeight: "700" }]}>{appt.serviceNameSnapshot}</Text>
                  <Text style={{
                    fontWeight: "700",
                    color: appt.status === "confirmed" ? colors.gold :
                           appt.status === "completed" ? "#4ade80" :
                           appt.status === "cancelled" ? colors.danger : colors.muted
                  }}>
                    {statusLabel[appt.status] || appt.status}
                  </Text>
                </View>
                <Text style={styles.text}>Khách: {appt.customerNameSnapshot}</Text>
                <Text style={styles.muted}>Thợ: {appt.barberNameSnapshot}</Text>
                <Text style={styles.text}>Thời gian: {dateTimeLabel(appt.startAt)} - {timeLabel(appt.endAt)}</Text>
                <Text style={[styles.text, { color: colors.gold }]}>Giá: {money(appt.priceSnapshot)}</Text>

                {/* Status action buttons */}
                {appt.status === "pending" && (
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                    <View style={{ flex: 1 }}>
                      <Button title="Xác nhận" onPress={() => handleStatusChange(appt.id, "confirmed")} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button title="Hủy lịch" secondary onPress={() => handleStatusChange(appt.id, "cancelled")} />
                    </View>
                  </View>
                )}
                {appt.status === "confirmed" && (
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                    <View style={{ flex: 1 }}>
                      <Button title="Hoàn thành" onPress={() => handleStatusChange(appt.id, "completed")} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button title="Hủy lịch" secondary onPress={() => handleStatusChange(appt.id, "cancelled")} />
                    </View>
                  </View>
                )}
              </Card>
            ))
          )}
        </View>
      )}

      {/* TAB 3: SERVICES */}
      {activeTab === "services" && (
        <View style={{ gap: 12 }}>
          <Text style={styles.subtitle}>Thêm dịch vụ mới</Text>
          <Card>
            <Field label="Tên dịch vụ" value={newSvcName} onChange={setNewSvcName} />
            <Field label="Mô tả" value={newSvcDesc} onChange={setNewSvcDesc} multiline />
            <Field label="Giá tiền (VNĐ)" value={newSvcPrice} onChange={setNewSvcPrice} numeric />
            <Field label="Thời gian (phút)" value={newSvcDuration} onChange={setNewSvcDuration} numeric />
            <Button title="Tạo dịch vụ" onPress={handleCreateService} />
          </Card>

          <Text style={styles.subtitle}>Dịch vụ hiện có</Text>
          {services.map((svc) => (
            <Card key={svc.id}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={[styles.text, { fontWeight: "700" }]}>{svc.name}</Text>
                <Text style={[styles.text, { color: colors.gold }]}>{money(svc.price)}</Text>
              </View>
              <Text style={styles.muted}>{svc.description}</Text>
              <Text style={styles.muted}>Thời lượng: {svc.durationMinutes} phút | Trạng thái: {svc.active ? "Đang phục vụ" : "Tạm ngưng"}</Text>
              {svc.active && (
                <View style={{ marginTop: 6 }}>
                  <Button title="Ngưng hoạt động" secondary onPress={() => handleDeactivateService(svc.id)} />
                </View>
              )}
            </Card>
          ))}
        </View>
      )}

      {/* TAB 4: BARBERS */}
      {activeTab === "barbers" && (
        <View style={{ gap: 12 }}>
          <Text style={styles.subtitle}>Thêm thợ tóc mới</Text>
          <Card>
            <Field label="Tên thợ" value={newBarberName} onChange={setNewBarberName} />
            <Field label="Giới thiệu kinh nghiệm, phong cách" value={newBarberBio} onChange={setNewBarberBio} multiline />
            <Button title="Thêm thợ" onPress={handleCreateBarber} />
          </Card>

          <Text style={styles.subtitle}>Danh sách thợ</Text>
          {barbers.map((b) => (
            <Card key={b.id}>
              <Text style={[styles.text, { fontWeight: "700" }]}>{b.name}</Text>
              <Text style={styles.muted}>{b.bio}</Text>
              <Text style={styles.muted}>Trạng thái: {b.active ? "Đang làm việc" : "Đã ngưng"}</Text>
              {b.active && (
                <View style={{ marginTop: 6 }}>
                  <Button title="Tạm ngưng thợ" secondary onPress={() => handleDeactivateBarber(b.id)} />
                </View>
              )}
            </Card>
          ))}
        </View>
      )}

      {/* TAB 5: SCHEDULES */}
      {activeTab === "schedules" && (
        <View style={{ gap: 12 }}>
          <Text style={styles.subtitle}>Thêm ca làm việc cho thợ</Text>
          <Card>
            <Text style={styles.muted}>Chọn thợ</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {barbers.map((b) => (
                <Pressable
                  key={b.id}
                  onPress={() => setNewSchedBarberId(b.id)}
                  style={[
                    styles.button,
                    newSchedBarberId !== b.id && styles.buttonSecondary,
                    { flex: 1, paddingVertical: 10 }
                  ]}
                >
                  <Text style={[styles.buttonText, newSchedBarberId !== b.id && { color: colors.text }]}>
                    {b.name}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Field label="Ngày làm việc (YYYY-MM-DD)" value={newSchedDate} onChange={setNewSchedDate} />
            <Field label="Giờ bắt đầu (HH:mm)" value={newSchedStart} onChange={setNewSchedStart} />
            <Field label="Giờ kết thúc (HH:mm)" value={newSchedEnd} onChange={setNewSchedEnd} />
            <Button title="Tạo lịch làm việc" onPress={handleCreateSchedule} />
          </Card>

          <Text style={styles.subtitle}>Lịch làm việc gần nhất</Text>
          {schedules.slice(0, 15).map((sch) => {
            const barber = barbers.find((b) => b.id === sch.barberId);
            return (
              <Card key={sch.id}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={[styles.text, { fontWeight: "700" }]}>{barber?.name || sch.barberId}</Text>
                  <Text style={styles.muted}>{sch.date}</Text>
                </View>
                <Text style={styles.text}>Ca: {sch.startTime} - {sch.endTime}</Text>
                <View style={{ marginTop: 6 }}>
                  <Button title="Xóa lịch" secondary onPress={() => handleDeleteSchedule(sch.id)} />
                </View>
              </Card>
            );
          })}
        </View>
      )}
    </Page>
  );
}

