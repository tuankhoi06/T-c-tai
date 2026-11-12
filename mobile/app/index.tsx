import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ImageBackground, Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { api, clearToken, onUnauthorized, restoreToken, saveToken } from "../src/api";
import { User } from "../src/types";
import {
  Button,
  Card,
  ErrorText,
  Field,
  Loading,
  Page,
  styles,
  colors
} from "../src/ui";
import { Customer } from "../src/Customer";
import { Consultation } from "../src/Consultation";
import { Admin } from "../src/Admin";
import { BarberApp } from "../src/Barber";
import { photos } from "../src/visuals";
import { unregisterPushToken } from "../src/push";

export default function AppIndex() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  // Separate portal: 'customer' vs 'admin'
  const [portal, setPortal] = useState<"customer" | "admin" | "barber">("customer");
  // Customer sub-tab: 'login' vs 'register'
  const [customerAuthMode, setCustomerAuthMode] = useState<"login" | "register" | "forgot">("login");

  // Auth fields
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");

  const [loading, setLoading] = useState(true);
  const [onboardingStep, setOnboardingStep] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    onUnauthorized(() => {
      setCurrentUser(null);
    });
    checkAuth();
    void (async () => {
      const done = Platform.OS === "web" ? (typeof window !== "undefined" ? window.localStorage.getItem("hairmatch_onboarding") : "1") : await SecureStore.getItemAsync("hairmatch_onboarding");
      setOnboardingStep(done ? -1 : 0);
    })();
  }, []);

  async function checkAuth() {
    setLoading(true);
    try {
      const saved = await restoreToken();
      if (saved) {
        try {
          const me = await api<User>("/me");
          setCurrentUser(me);
          return;
        } catch {
          await clearToken();
        }
      }
    } catch {
      await clearToken();
      setCurrentUser(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin() {
    const cleanPhone = phone.replace(/\D/g, "");
    if (!cleanPhone || !password) {
      setError("Vui lòng nhập số điện thoại và mật khẩu.");
      return;
    }
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const res = await api<{ token: string; user: User }>("/auth/login", {
        method: "POST",
        body: { phone: cleanPhone, password }
      });
      await saveToken(res.token);
      setCurrentUser(res.user);
    } catch (err: any) {
      setError(err.message || "Đăng nhập thất bại.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister() {
    const cleanPhone = phone.replace(/\D/g, "");
    if (name.trim().length < 2) {
      setError("Tên đăng nhập cần ít nhất 2 ký tự.");
      return;
    }
    if (!/^0\d{9}$/.test(cleanPhone)) {
      setError("Số điện thoại cần gồm 10 chữ số và bắt đầu bằng 0.");
      return;
    }
    if (!password || password.length < 8) {
      setError("Mật khẩu cần tối thiểu 8 ký tự.");
      return;
    }
    if (password !== confirmPassword) { setError("Mật khẩu xác nhận không khớp."); return; }

    setLoading(true);
    setError("");
    setNotice("");
    try {
      const res = await api<{ token: string; user: User }>("/auth/register", { method: "POST", body: { username: name.trim(), phone: cleanPhone, password } });
      await saveToken(res.token);
      setCurrentUser(res.user);
    } catch (err: any) {
      setError(err.message || "Đăng ký thất bại.");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    const cleanPhone = phone.replace(/\D/g, "");
    if (!/^0\d{9}$/.test(cleanPhone)) { setError("Nhập số điện thoại gồm 10 chữ số."); return; }
    setLoading(true); setError(""); setNotice("");
    try {
      const res = await api<{ temporaryPassword: string; message: string }>("/auth/forgot-password", { method: "POST", body: { phone: cleanPhone } });
      setTemporaryPassword(res.temporaryPassword);
      setNotice(res.message);
    } catch (err: any) { setError(err.message || "Không cấp được mật khẩu tạm."); }
    finally { setLoading(false); }
  }

  async function handleLogout() {
    try {
      await unregisterPushToken();
      await api("/auth/logout", { method: "POST" });
    } catch {
      // ignore
    } finally {
      await clearToken();
      setCurrentUser(null);
      setPassword("");
      setPhone("");
      setCustomerAuthMode("login");
    }
  }

  // Quick fill helper
  function fillDemo(type: "admin" | "customer" | "barber") {
    if (type === "admin") {
      setPortal("admin");
      setPhone("0900000000");
      setPassword("Admin123!");
    } else if (type === "barber") {
      setPortal("barber");
      setPhone("0900000204");
      setPassword("Barber123!");
    } else {
      setPortal("customer");
      setCustomerAuthMode("login");
      setPhone("0911111111");
      setPassword("Customer123!");
    }
  }

  if (onboardingStep === null || (loading && !currentUser)) {
    return (
      <View style={[styles.page, { justifyContent: "center", alignItems: "center" }]}>
        <Loading />
        <Text style={styles.muted}>Đang khởi tạo HairMatch...</Text>
      </View>
    );
  }
  if (onboardingStep >= 0) {
    const slides = [
      { title: "Chọn kiểu tóc phù hợp", body: "Tải ảnh chân dung để nhận gợi ý AI và chuyển kiểu tóc mong muốn cho thợ." },
      { title: "Đặt lịch nhanh", body: "Chọn dịch vụ, thợ và giờ còn trống. Xem lịch và thông báo ngay trong ứng dụng." },
      { title: "Theo dõi trải nghiệm", body: "Xem lịch sử, ưu đãi và đánh giá sau khi hoàn thành ca." }
    ];
    return <Page><Text style={styles.muted}>HAIRMATCH · {onboardingStep + 1}/3</Text>
      <Card><Text style={styles.title}>{slides[onboardingStep].title}</Text><Text style={styles.text}>{slides[onboardingStep].body}</Text></Card>
      <Button title={onboardingStep === 2 ? "Bắt đầu" : "Tiếp tục"} onPress={() => {
        if (onboardingStep < 2) { setOnboardingStep(onboardingStep + 1); return; }
        if (Platform.OS === "web") { if (typeof window !== "undefined") window.localStorage.setItem("hairmatch_onboarding", "1"); }
        else void SecureStore.setItemAsync("hairmatch_onboarding", "1");
        setOnboardingStep(-1);
      }} />
    </Page>;
  }

  // Not logged in -> Show Separated Portals (Customer vs Admin)
  if (!currentUser) {
    return (
      <Page>
        <ImageBackground source={photos.loginHero} resizeMode="cover" imageStyle={{ borderRadius: 26 }} style={{ minHeight: 280, borderRadius: 26, overflow: "hidden", backgroundColor: colors.card }}>
          <View style={{ minHeight: 280, justifyContent: "space-between", padding: 22, backgroundColor: colors.photoOverlay }}>
            <Text style={[styles.muted, { color: colors.cream, fontWeight: "700", letterSpacing: 2, fontSize: 12 }]}>HAIRMATCH  ✦  CLASSIC BARBERSHOP</Text>
            <View style={{ gap: 8 }}>
              <Text style={[styles.title, { color: colors.cream, fontSize: 36, lineHeight: 40 }]}>DIỆN MẠO MỚI. PHONG CÁCH RIÊNG.</Text>
              <Text style={[styles.text, { color: colors.text, maxWidth: 520 }]}>Nghệ thuật cắt tóc cổ điển, đặt lịch hiện đại. Bắt đầu trải nghiệm của bạn.</Text>
            </View>
          </View>
        </ImageBackground>

        {/* Portal Switcher (Customer vs Admin) */}
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 4 }}>
          <Pressable
            onPress={() => {
              setPortal("customer");
              setError("");
            }}
            style={[
              styles.button,
              portal !== "customer" && styles.buttonSecondary,
              { flex: 1, paddingVertical: 11 }
            ]}
          >
            <Text style={[styles.buttonText, { fontSize: 13 }, portal !== "customer" && { color: colors.text }]}>
              👤 Khách hàng
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setPortal("admin");
              setError("");
            }}
            style={[
              styles.button,
              portal !== "admin" && styles.buttonSecondary,
              { flex: 1, paddingVertical: 11 }
            ]}
          >
            <Text style={[styles.buttonText, { fontSize: 13 }, portal !== "admin" && { color: colors.text }]}>
              🔐 Chủ tiệm (Admin)
            </Text>
          </Pressable>
          <Pressable onPress={() => { setPortal("barber"); setError(""); }} style={[styles.button, portal !== "barber" && styles.buttonSecondary, { flex: 1, paddingVertical: 11 }]}>
            <Text style={[styles.buttonText, { fontSize: 13 }, portal !== "barber" && { color: colors.text }]}>✂ Thợ</Text>
          </Pressable>
        </View>

        <ErrorText message={error} />

        {/* ===================== PORTAL 1: CUSTOMER ===================== */}
        {portal === "customer" && (
          <View style={{ gap: 10 }}>
            {/* Customer Sub-tabs: Login / Register */}
            {(customerAuthMode === "login" || customerAuthMode === "register") && <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={() => {
                  setCustomerAuthMode("login");
                  setError("");
                }}
                style={[
                  styles.button,
                  customerAuthMode !== "login" && styles.buttonSecondary,
                  { flex: 1, paddingVertical: 9 }
                ]}
              >
                <Text style={[styles.buttonText, { fontSize: 13 }, customerAuthMode !== "login" && { color: colors.text }]}>
                  Đăng nhập
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setCustomerAuthMode("register");
                  setError("");
                }}
                style={[
                  styles.button,
                  customerAuthMode !== "register" && styles.buttonSecondary,
                  { flex: 1, paddingVertical: 9 }
                ]}
              >
                <Text style={[styles.buttonText, { fontSize: 13 }, customerAuthMode !== "register" && { color: colors.text }]}>
                  Đăng ký
                </Text>
              </Pressable>
            </View>}

            {customerAuthMode !== "login" && customerAuthMode !== "register" && <Button title="← Quay lại đăng nhập" secondary onPress={() => { setCustomerAuthMode("login"); setError(""); setNotice(""); }} />}
            {!!notice && <Text style={[styles.muted, { color: colors.gold }]}>{notice}</Text>}

            {/* Customer Login Form */}
            {customerAuthMode === "login" && (
              <Card>
                <Text style={[styles.subtitle, { fontSize: 16 }]}>Đăng nhập dành cho Khách hàng</Text>
                <Field
                  label="Số điện thoại"
                  value={phone}
                  onChange={setPhone}
                  numeric
                />
                <Field
                  label="Mật khẩu"
                  value={password}
                  onChange={setPassword}
                  secure
                />

                <View style={{ alignItems: "flex-end", marginTop: 2 }}>
                  <Pressable onPress={() => { setCustomerAuthMode("forgot"); setError(""); setNotice(""); setTemporaryPassword(""); }}>
                    <Text style={{ color: colors.gold, fontSize: 13, fontWeight: "600" }}>
                      Quên mật khẩu?
                    </Text>
                  </Pressable>
                </View>

                <View style={{ marginTop: 6 }}>
                  <Button
                    title="Đăng nhập Khách hàng"
                    onPress={handleLogin}
                    disabled={loading}
                  />
                </View>

                {/* Quick Demo Customer Button */}
                <View style={{ marginTop: 6 }}>
                  <Button
                    title="Điền nhanh tài khoản Khách hàng demo"
                    secondary
                    onPress={() => fillDemo("customer")}
                  />
                </View>
              </Card>
            )}

            {/* Customer Register Form */}
            {customerAuthMode === "register" && (
              <Card>
                <Text style={[styles.subtitle, { fontSize: 16 }]}>Tạo tài khoản Khách hàng mới</Text>
                <Field
                  label="Tên đăng nhập"
                  value={name}
                  onChange={setName}
                />
                <Field
                  label="Số điện thoại"
                  value={phone}
                  onChange={setPhone}
                  numeric
                />
                <Field
                  label="Mật khẩu (tối thiểu 8 ký tự)"
                  value={password}
                  onChange={setPassword}
                  secure
                />
                <Field label="Xác nhận mật khẩu" value={confirmPassword} onChange={setConfirmPassword} secure />
                <View style={{ marginTop: 6 }}>
                  <Button
                    title="Tạo tài khoản"
                    onPress={handleRegister}
                    disabled={loading}
                  />
                </View>
              </Card>
            )}

            {customerAuthMode === "forgot" && <Card>
              <Text style={[styles.subtitle, { fontSize: 16 }]}>Khôi phục mật khẩu</Text>
              <Text style={styles.muted}>Nhập số điện thoại tài khoản để tạo mật khẩu tạm mới. Mật khẩu sẽ hiện ngay bên dưới.</Text>
              <Field label="Số điện thoại" value={phone} onChange={(value) => { setPhone(value); setTemporaryPassword(""); }} numeric />
              <Button title={loading ? "Đang tạo..." : "Tạo mật khẩu tạm"} onPress={() => void handleForgotPassword()} disabled={loading} />
              {!!temporaryPassword && <Card style={{ borderColor: colors.danger }}><Text style={[styles.text, { fontWeight: "800" }]}>Mật khẩu tạm mới</Text><Text selectable style={[styles.title, { color: colors.gold }]}>{temporaryPassword}</Text><Text style={styles.muted}>Đăng nhập bằng mật khẩu này. Có thể đổi sau trong hồ sơ.</Text></Card>}
            </Card>}
          </View>
        )}

        {/* ===================== PORTAL 2: ADMIN ===================== */}
        {(portal === "admin" || portal === "barber") && (
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={[styles.subtitle, { color: colors.gold, fontSize: 17 }]}>
                {portal === "barber" ? "Đăng nhập thợ" : "Cổng Quản trị viên (Chủ tiệm)"}
              </Text>
            </View>
            <Text style={[styles.muted, { fontSize: 13 }]}>
              {portal === "barber" ? "Tài khoản thợ do chủ tiệm tạo. Chỉ xem lịch cá nhân và hoa hồng." : "Khu vực dành riêng cho chủ salon và quản lý ca làm việc, duyệt lịch hẹn."}
            </Text>

            {customerAuthMode !== "forgot" && <><Field
              label="Số điện thoại"
              value={phone}
              onChange={setPhone}
              numeric
            />
            <Field
              label="Mật khẩu quản trị"
              value={password}
              onChange={setPassword}
              secure
            />

            <View style={{ marginTop: 6 }}>
              <Button
                title={portal === "barber" ? "Đăng nhập thợ" : "Đăng nhập Quản trị"}
                onPress={handleLogin}
                disabled={loading}
              />
            </View>

            {portal === "admin" && <View style={{ marginTop: 6 }}>
              <Button
                title="Điền nhanh tài khoản Admin demo"
                secondary
                onPress={() => fillDemo("admin")}
              />
            </View>}
            {portal === "barber" && <View style={{ marginTop: 6 }}>
              <Button
                title="Điền nhanh tài khoản Duy"
                secondary
                onPress={() => fillDemo("barber")}
              />
            </View>}
            </>}
            <View style={{ marginTop: 6, alignItems: "flex-end" }}>
              <Pressable onPress={() => { setCustomerAuthMode("forgot"); setTemporaryPassword(""); setError(""); setNotice(""); }}>
                <Text style={{ color: colors.gold, fontSize: 13, fontWeight: "600" }}>Quên mật khẩu?</Text>
              </Pressable>
            </View>
            {customerAuthMode === "forgot" && <View style={{ gap: 10, marginTop: 8 }}>
              <Button title="← Quay lại đăng nhập" secondary onPress={() => { setCustomerAuthMode("login"); setTemporaryPassword(""); setError(""); setNotice(""); }} />
              <Text style={styles.muted}>Nhập số điện thoại tài khoản để tạo mật khẩu tạm mới.</Text>
              <Field label="Số điện thoại" value={phone} onChange={(value) => { setPhone(value); setTemporaryPassword(""); }} numeric />
              <Button title={loading ? "Đang tạo..." : "Tạo mật khẩu tạm"} onPress={() => void handleForgotPassword()} disabled={loading} />
              {!!temporaryPassword && <Card style={{ borderColor: colors.danger }}><Text style={[styles.text, { fontWeight: "800" }]}>Mật khẩu tạm mới</Text><Text selectable style={[styles.title, { color: colors.gold }]}>{temporaryPassword}</Text></Card>}
            </View>}
          </Card>
        )}
      </Page>
    );
  }

  // Admin Role View
  if (currentUser.role === "admin") {
    return <Admin user={currentUser} onLogout={handleLogout} />;
  }
  if (currentUser.role === "barber") return <BarberApp user={currentUser} onLogout={handleLogout} />;

  // Customer Role View (features 4 bottom navigation tabs: Home, AI, Appointments, Profile)
  return (
    <Customer
      user={currentUser}
      onLogout={handleLogout}
      onUserUpdated={setCurrentUser}
    />
  );
}
