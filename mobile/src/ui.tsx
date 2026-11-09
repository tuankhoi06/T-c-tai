import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from "react-native";

export const colors = {
  background: "#28180F",
  card: "#3A261A",
  input: "#2F1E13",
  text: "#FFF0DF",
  muted: "#C5AC94",
  gold: "#FF7A2D",
  border: "#614630",
  success: "#A4B17A",
  danger: "#D9785B",
  cream: "#F5D9BD",
  dark: "#201209",
  overlay: "#1B100BCC",
  photoOverlay: "#1B100BA8",
  statusPending: "#A87532",
  statusConfirmed: "#60796F",
  statusInProgress: "#C95D25",
  statusCompleted: "#71834F",
  statusCancelled: "#76533D",
  statusNoShow: "#A4493B"
};

const appFont = Platform.OS === "android" ? "Roboto" : undefined;

export const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.background
  },
  content: {
    padding: 16,
    paddingBottom: 28,
    gap: 14
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
    fontFamily: appFont
  },
  subtitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: "700",
    letterSpacing: -0.3,
    fontFamily: appFont
  },
  text: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 23,
    fontFamily: appFont
  },
  muted: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: appFont
  },
  card: {
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 16,
    gap: 9,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000000",
    shadowOpacity: 0.16,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2
  },
  input: {
    backgroundColor: colors.input,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 15,
    fontFamily: appFont
  },
  button: {
    backgroundColor: colors.gold,
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center"
  },
  buttonSecondary: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border
  },
  buttonText: {
    color: colors.dark,
    fontWeight: "700",
    fontSize: 15,
    fontFamily: appFont
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  error: {
    color: colors.danger,
    lineHeight: 21,
    fontFamily: appFont
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 8
  }
});

export function Page({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={{ alignItems: "center", paddingVertical: 14, paddingBottom: 28 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ width: Math.max(0, Math.min(width - 32, 1024)), gap: 14 }}>{children}</View>
    </ScrollView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: any }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Avatar({ name, uri, size = 48 }: { name: string; uri?: string; size?: number }) {
  const initials = name.trim().split(/\s+/).slice(-2).map((part) => part[0]?.toLocaleUpperCase("vi-VN") || "").join("");
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center", backgroundColor: colors.cream, borderWidth: 1, borderColor: colors.border }}><Text style={{ color: colors.dark, fontSize: Math.max(14, size * 0.32), fontWeight: "800" }}>{initials}</Text></View>;
}

export function ShopClock({ label = "Giờ tiệm" }: { label?: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const formatted = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).format(new Date(now));
  return <Text style={styles.muted}>◷ {label} · {formatted}</Text>;
}

export function Button({
  title,
  onPress,
  disabled = false,
  secondary = false
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        secondary && styles.buttonSecondary,
        disabled && { opacity: 0.45 }
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          secondary && { color: colors.text }
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChange,
  secure = false,
  numeric = false,
  multiline = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  secure?: boolean;
  numeric?: boolean;
  multiline?: boolean;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.muted}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        secureTextEntry={secure}
        keyboardType={numeric ? "number-pad" : "default"}
        multiline={multiline}
        autoCapitalize="none"
        style={[
          styles.input,
          multiline && {
            minHeight: 100,
            textAlignVertical: "top"
          }
        ]}
        placeholderTextColor={colors.muted}
      />
    </View>
  );
}

export function Loading() {
  return (
    <ActivityIndicator
      color={colors.gold}
      style={{ marginVertical: 20 }}
    />
  );
}

export function ErrorText({ message }: { message: string }) {
  if (!message) return null;
  return <Text style={styles.error}>{message}</Text>;
}

export function money(value: number) {
  return `${value.toLocaleString("vi-VN")} đ`;
}

export function shopDate(offset = 0) {
  const date = new Date(
    Date.now() + offset * 24 * 60 * 60 * 1000
  );

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value;

  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function timeLabel(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function dateTimeLabel(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export const statusLabel: Record<string, string> = {
  pending: "Chờ xác nhận",
  confirmed: "Đã xác nhận",
  in_progress: "Đang phục vụ",
  completed: "Đã hoàn thành",
  cancelled: "Đã hủy",
  no_show: "Khách không đến"
};

