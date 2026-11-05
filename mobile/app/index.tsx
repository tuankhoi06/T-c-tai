import React, { useEffect, useState } from "react";
import { View, Text, Pressable, SafeAreaView, Alert } from "react-native";
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

export default function AppIndex() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  // Separate portal: 'customer' vs 'admin'
  const [portal, setPortal] = useState<"customer" | "admin">("customer");
  // Customer sub-tab: 'login' vs 'register'
  const [customerAuthMode, setCustomerAuthMode] = useState<"login" | "register">("login");
  const [customerScreen, setCustomerScreen] = useState<"booking" | "ai">("booking");

  // Auth fields
  const [identifier, setIdentifier] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    onUnauthorized(() => {
      setCurrentUser(null);
    });
    checkAuth();
  }, []);

  async function checkAuth() {
    setLoading(true);
    try {
      const saved = await restoreToken();
      if (saved) {
        const me = await api<User>("/me");
        setCurrentUser(me);
      }
    } catch {
      await clearToken();
      setCurrentUser(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin() {
    const loginKey = identifier.trim() || phone.trim();
    if (!loginKey || !password) {
      setError("Vui lòng nhập số điện thoại hoặc email cùng mật khẩu.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await api<{ token: string; user: User }>("/auth/login", {
        method: "POST",
        body: { identifier: loginKey, password }
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
    const cleanPhone = phone.trim();
    const cleanEmail = email.trim();

    if (!name.trim()) {
      setError("Vui lòng nhập họ và tên.");
      return;
    }
    if (!cleanPhone && !cleanEmail) {
      setError("Vui lòng nhập ít nhất số điện thoại hoặc email để đăng ký và lấy lại mật khẩu sau này.");
      return;
    }
    if (!password || password.length < 8) {
      setError("Mật khẩu cần tối thiểu 8 ký tự.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await api<{ token: string; user: User }>("/auth/register", {
        method: "POST",
        body: {
          name: name.trim(),
          phone: cleanPhone || undefined,
          email: cleanEmail || undefined,
          password
        }
      });
      await saveToken(res.token);
      setCurrentUser(res.user);
    } catch (err: any) {
      setError(err.message || "Đăng ký thất bại.");
    } finally {
      setLoading(false);
    }
  }

  function handleForgotPassword() {
    Alert.alert(
      "Quên mật khẩu (Bản thử nghiệm Demo)",
      "Tính năng đang chạy ở chế độ demo.\nMã xác thực khôi phục mật khẩu sẽ được gửi đến số điện thoại hoặc email đã đăng ký của bạn khi hệ thống kết nối dịch vụ SMS/Mail."
    );
  }

  async function handleLogout() {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      // ignore
    } finally {
      await clearToken();
      setCurrentUser(null);
      setPassword("");
      setIdentifier("");
    }
  }

  // Quick fill helper
  function fillDemo(type: "admin" | "customer") {
    if (type === "admin") {
      setPortal("admin");
      setIdentifier("0900000000");
      setPassword("Admin123!");
    } else {
      setPortal("customer");
      setCustomerAuthMode("login");
      setIdentifier("0911111111");
      setPassword("Customer123!");
    }
  }

  if (loading && !currentUser) {
    return (
      <View style={[styles.page, { justifyContent: "center", alignItems: "center" }]}>
        <Loading />
        <Text style={styles.muted}>Đang khởi tạo HairMatch...</Text>
      </View>
    );
  }

  // Not logged in -> Show Separated Portals (Customer vs Admin)
  if (!currentUser) {
    return (
      <Page>
        <View style={{ alignItems: "center", marginTop: 14, marginBottom: 10 }}>
          <Text style={[styles.title, { fontSize: 34 }]}>HairMatch</Text>
          <Text style={styles.muted}>Đặt lịch làm tóc & Tư vấn phong cách AI</Text>
        </View>

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
        </View>

        <ErrorText message={error} />

        {/* ===================== PORTAL 1: CUSTOMER ===================== */}
        {portal === "customer" && (
          <View style={{ gap: 10 }}>
            {/* Customer Sub-tabs: Login / Register */}
            <View style={{ flexDirection: "row", gap: 10 }}>
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
            </View>

            {/* Customer Login Form */}
            {customerAuthMode === "login" && (
              <Card>
                <Text style={[styles.subtitle, { fontSize: 16 }]}>Đăng nhập dành cho Khách hàng</Text>
                <Field
                  label="Số điện thoại hoặc Email"
                  value={identifier}
                  onChange={setIdentifier}
                />
                <Field
                  label="Mật khẩu"
                  value={password}
                  onChange={setPassword}
                  secure
                />

                {/* Quên mật khẩu (Demo) */}
                <View style={{ alignItems: "flex-end", marginTop: 2 }}>
                  <Pressable onPress={handleForgotPassword}>
                    <Text style={{ color: colors.gold, fontSize: 13, fontWeight: "600" }}>
                      Quên mật khẩu? (Demo)
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
                  label="Họ và tên của bạn"
                  value={name}
                  onChange={setName}
                />
                <Field
                  label="Số điện thoại (dùng để đặt lịch & khôi phục)"
                  value={phone}
                  onChange={setPhone}
                  numeric
                />
                <Field
                  label="Email (dùng nhận thông báo & quên mật khẩu)"
                  value={email}
                  onChange={setEmail}
                />
                <Field
                  label="Mật khẩu (tối thiểu 8 ký tự)"
                  value={password}
                  onChange={setPassword}
                  secure
                />

                <Text style={[styles.muted, { fontSize: 12 }]}>
                  * Bạn có thể đăng ký bằng số điện thoại hoặc email (hoặc cả hai) để sử dụng khôi phục mật khẩu sau này.
                </Text>

                <View style={{ marginTop: 6 }}>
                  <Button
                    title="Tạo tài khoản ngay"
                    onPress={handleRegister}
                    disabled={loading}
                  />
                </View>
              </Card>
            )}
          </View>
        )}

        {/* ===================== PORTAL 2: ADMIN ===================== */}
        {portal === "admin" && (
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={[styles.subtitle, { color: colors.gold, fontSize: 17 }]}>
                Cổng Quản trị viên (Chủ tiệm)
              </Text>
            </View>
            <Text style={[styles.muted, { fontSize: 13 }]}>
              Khu vực dành riêng cho chủ salon và quản lý ca làm việc, duyệt lịch hẹn.
            </Text>

            <Field
              label="Số điện thoại hoặc Email quản trị"
              value={identifier}
              onChange={setIdentifier}
            />
            <Field
              label="Mật khẩu quản trị"
              value={password}
              onChange={setPassword}
              secure
            />

            <View style={{ alignItems: "flex-end", marginTop: 2 }}>
              <Pressable onPress={handleForgotPassword}>
                <Text style={{ color: colors.gold, fontSize: 13, fontWeight: "600" }}>
                  Quên mật khẩu quản trị? (Demo)
                </Text>
              </Pressable>
            </View>

            <View style={{ marginTop: 6 }}>
              <Button
                title="Đăng nhập Quản trị"
                onPress={handleLogin}
                disabled={loading}
              />
            </View>

            <View style={{ marginTop: 6 }}>
              <Button
                title="Điền nhanh tài khoản Admin demo (0900000000)"
                secondary
                onPress={() => fillDemo("admin")}
              />
            </View>
          </Card>
        )}
      </Page>
    );
  }

  // Admin Role View
  if (currentUser.role === "admin") {
    return <Admin user={currentUser} onLogout={handleLogout} />;
  }

  // Customer Role View
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Top Navbar for Customer */}
      <SafeAreaView style={{ backgroundColor: "#181818", borderBottomWidth: 1, borderColor: colors.border }}>
        <View style={{ paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View>
            <Text style={[styles.subtitle, { color: colors.gold, fontSize: 20 }]}>HairMatch</Text>
            <Text style={[styles.muted, { fontSize: 12 }]}>Xin chào, {currentUser.name}</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 6 }}>
            <Pressable
              onPress={() => setCustomerScreen("booking")}
              style={[
                styles.button,
                customerScreen !== "booking" && styles.buttonSecondary,
                { paddingVertical: 6, paddingHorizontal: 12 }
              ]}
            >
              <Text style={[styles.buttonText, { fontSize: 12 }, customerScreen !== "booking" && { color: colors.text }]}>
                Đặt lịch
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setCustomerScreen("ai")}
              style={[
                styles.button,
                customerScreen !== "ai" && styles.buttonSecondary,
                { paddingVertical: 6, paddingHorizontal: 12 }
              ]}
            >
              <Text style={[styles.buttonText, { fontSize: 12 }, customerScreen !== "ai" && { color: colors.text }]}>
                AI Tư vấn
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      {customerScreen === "booking" ? (
        <Customer user={currentUser} onLogout={handleLogout} onUserUpdated={setCurrentUser} />
      ) : (
        <Consultation />
      )}
    </View>
  );
}
