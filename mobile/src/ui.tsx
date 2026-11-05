import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";

export const colors = {
  background: "#111111",
  card: "#1e1e1e",
  text: "#ffffff",
  muted: "#b9b9b9",
  gold: "#e9bb55",
  border: "#393939",
  danger: "#ff7777"
};

export const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.background
  },
  content: {
    padding: 18,
    paddingBottom: 32,
    gap: 12
  },
  title: {
    color: colors.gold,
    fontSize: 28,
    fontWeight: "800"
  },
  subtitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "700"
  },
  text: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22
  },
  muted: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21
  },
  card: {
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border
  },
  input: {
    backgroundColor: colors.card,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 15
  },
  button: {
    backgroundColor: colors.gold,
    padding: 13,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center"
  },
  buttonSecondary: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border
  },
  buttonText: {
    color: "#111",
    fontWeight: "700",
    fontSize: 15
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  error: {
    color: colors.danger,
    lineHeight: 21
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 8
  }
});

export function Page({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
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
  completed: "Đã hoàn thành",
  cancelled: "Đã hủy"
};

