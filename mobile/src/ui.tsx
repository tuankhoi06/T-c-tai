import type { ComponentProps, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
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
    minHeight: 48,
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
      nestedScrollEnabled
    >
      <View style={{ width: Math.max(0, Math.min(width - 32, 1024)), gap: 14 }}>{children}</View>
    </ScrollView>
  );
}

const NativeScrollView = ScrollView as any;
export function DragScrollView(props: ComponentProps<typeof ScrollView>) {
  const drag = useRef<{ pointerId: number; startX: number; startScroll: number; target: any } | null>(null);
  const moved = useRef(false);
  function pointerDown(event: any) {
    if (Platform.OS !== "web" || event.pointerType !== "mouse" || event.button !== 0) return;
    const target = event.currentTarget;
    if (!target || target.scrollWidth <= target.clientWidth) return;
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startScroll: target.scrollLeft, target };
    moved.current = false;
    target.style.cursor = "grabbing";
    target.style.userSelect = "none";
  }
  function pointerMove(event: any) {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    const delta = event.clientX - drag.current.startX;
    if (Math.abs(delta) > 4 && !moved.current) {
      moved.current = true;
      drag.current.target.setPointerCapture?.(event.pointerId);
    }
    if (moved.current) {
      event.preventDefault?.();
      drag.current.target.scrollLeft = drag.current.startScroll - delta;
    }
  }
  function pointerUp(event: any) {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    const { target, pointerId } = drag.current;
    target.style.cursor = "grab";
    target.style.userSelect = "";
    if (target.hasPointerCapture?.(pointerId)) target.releasePointerCapture(pointerId);
    drag.current = null;
  }
  function clickCapture(event: any) {
    if (!moved.current) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    moved.current = false;
  }
  return <NativeScrollView
    {...props}
    nestedScrollEnabled
    directionalLockEnabled
    keyboardShouldPersistTaps="handled"
    style={[props.style, Platform.OS === "web" ? ({ cursor: "grab" } as any) : null]}
    onPointerDown={pointerDown}
    onPointerMove={pointerMove}
    onPointerUp={pointerUp}
    onPointerCancel={pointerUp}
    onClickCapture={clickCapture}
  />;
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

export function ComboBox({ label, value, options, onChange, disabled = false, searchable = false, searchPlaceholder = "Tìm kiếm" }: {
  label: string;
  value: string;
  options: { label: string; value: string; searchText?: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const selected = options.find((option) => option.value === value);
  const visibleOptions = searchable && query.trim()
    ? options.filter((option) => `${option.label} ${option.searchText || ""}`.toLocaleLowerCase("vi-VN").includes(query.trim().toLocaleLowerCase("vi-VN")))
    : options;
  const pageSize = 8;
  const pageOptions = visibleOptions.slice(0, page * pageSize);
  return <>
    <View style={{ gap: 6 }}>
      <Text style={styles.muted}>{label}</Text>
      <Pressable accessibilityRole="button" disabled={disabled} onPress={() => { setQuery(""); setPage(1); setOpen(true); }} style={[styles.input, { flexDirection: "row", alignItems: "center", justifyContent: "space-between", opacity: disabled ? 0.5 : 1 }]}>
        <Text style={[styles.text, { flex: 1, textAlignVertical: "center" }]} numberOfLines={1}>{selected?.label || "Chọn mục"}</Text>
        <View style={{ width: 26, height: 24, marginLeft: 10, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: colors.gold, fontSize: 13, lineHeight: 16, textAlign: "center", includeFontPadding: false }}>▾</Text>
        </View>
      </Pressable>
    </View>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "center", padding: 16 }}>
        <View style={{ width: "100%", maxWidth: 520, height: 540, maxHeight: "78%", alignSelf: "center" }}>
          <View style={[styles.card, { padding: 12, flex: 1 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <Text style={styles.subtitle}>{label}</Text>
              <Pressable accessibilityRole="button" hitSlop={4} onPress={() => { setOpen(false); setQuery(""); setPage(1); }} style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}><Text style={{ color: colors.gold, fontWeight: "700", padding: 8 }}>Đóng</Text></Pressable>
            </View>
            {searchable && <TextInput value={query} onChangeText={(value) => { setQuery(value); setPage(1); }} placeholder={searchPlaceholder} placeholderTextColor={colors.muted} autoCapitalize="none" style={[styles.input, { marginBottom: 8 }]} />}
            <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled showsVerticalScrollIndicator>
              {pageOptions.map((option) => <Pressable key={option.value} onPress={() => { onChange(option.value); setOpen(false); setQuery(""); setPage(1); }} style={{ minHeight: 46, justifyContent: "center", paddingHorizontal: 12, borderRadius: 9, backgroundColor: option.value === value ? colors.gold : "transparent", marginBottom: 4 }}>
                <Text style={[styles.text, option.value === value && { color: colors.dark, fontWeight: "700" }]}>{option.label}</Text>
              </Pressable>)}
              {visibleOptions.length === 0 && <Text style={[styles.muted, { padding: 12 }]}>Không tìm thấy khách phù hợp.</Text>}
            </ScrollView>
            {pageOptions.length < visibleOptions.length && <Pressable accessibilityRole="button" onPress={() => setPage((current) => current + 1)} style={[styles.button, styles.buttonSecondary, { marginTop: 8 }]}>
              <Text style={[styles.buttonText, { color: colors.text }]}>Xem thêm {Math.min(pageSize, visibleOptions.length - pageOptions.length)} khách ↓</Text>
            </Pressable>}
          </View>
        </View>
      </View>
    </Modal>
  </>;
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

