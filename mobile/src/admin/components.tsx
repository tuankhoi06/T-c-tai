import React, { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { api } from "../api";
import { Button, Card, ErrorText, Field, Loading, colors, styles } from "../ui";

export function useAdminList<T>(path: string, active = true) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const reload = useCallback(async (silent = false) => {
    const id = ++requestId.current;
    if (!silent) setLoading(true);
    setError("");
    try { const result = await api<T>(path); if (id === requestId.current) setData(result); }
    catch (err: any) { if (id === requestId.current) setError(err.message || "Không tải được dữ liệu."); }
    finally { if (id === requestId.current) setLoading(false); }
  }, [path]);
  useEffect(() => { if (active) void reload(); }, [active, reload]);
  return { data, loading, error, reload, setData };
}

export function DataState({ loading, error, retry, empty }: { loading: boolean; error: string; retry: () => void; empty?: boolean }) {
  return <View style={{ gap: 8 }}>
    {loading && <Loading />}
    {!!error && <Card><ErrorText message={error} /><Button title="Thử lại" secondary onPress={retry} /></Card>}
    {!loading && !error && empty && <Card><Text style={styles.muted}>Không có dữ liệu phù hợp.</Text></Card>}
  </View>;
}

export function Choice({ options, value, onChange }: { options: { label: string; value: string }[]; value: string; onChange: (value: string) => void }) {
  return <View style={styles.row}>{options.map((option) => <Pressable key={option.value} onPress={() => onChange(option.value)} style={[styles.button, value !== option.value && styles.buttonSecondary, { minHeight: 44, paddingVertical: 8, paddingHorizontal: 11 }]}>
    <Text style={[styles.buttonText, value !== option.value && { color: colors.text }]}>{option.label}</Text>
  </Pressable>)}</View>;
}

export function FormModal({ title, visible, children, onClose }: { title: string; visible: boolean; children: React.ReactNode; onClose: () => void }) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "center", padding: 16 }}>
      <View style={{ width: "100%", maxWidth: 560, maxHeight: "90%", alignSelf: "center" }}>
        <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled><Card><View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><Text style={styles.subtitle}>{title}</Text><Button title="Đóng" secondary onPress={onClose} /></View>{children}</Card></ScrollView>
      </View>
    </View>
  </Modal>;
}

function localDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
function localTime(value: Date) {
  return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
}

export function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  if (Platform.OS === "web") return <View style={{ gap: 6, minWidth: 0 }}><Text style={styles.muted}>{label}</Text>{React.createElement("input" as any, { type: "date", value, onChange: (event: any) => onChange(event.target.value), style: { width: "100%", boxSizing: "border-box", background: colors.input, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 12, fontSize: 15, colorScheme: "dark" } })}</View>;
  return <View style={{ gap: 6 }}><Text style={styles.muted}>{label}</Text><Button title={value || "Chọn ngày"} secondary onPress={() => setOpen(true)} />{open && <DateTimePicker value={new Date(`${value || localDate(new Date())}T12:00:00`)} mode="date" onChange={(_event, date) => { setOpen(false); if (date) onChange(localDate(date)); }} />}</View>;
}

export function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  if (Platform.OS === "web") return <View style={{ gap: 6, minWidth: 0 }}><Text style={styles.muted}>{label}</Text>{React.createElement("input" as any, { type: "time", value, onChange: (event: any) => onChange(event.target.value), style: { width: "100%", boxSizing: "border-box", background: colors.input, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 12, fontSize: 15, colorScheme: "dark" } })}</View>;
  return <View style={{ gap: 6 }}><Text style={styles.muted}>{label}</Text><Button title={value || "Chọn giờ"} secondary onPress={() => setOpen(true)} />{open && <DateTimePicker value={new Date(`2020-01-01T${value || "09:00"}:00`)} mode="time" is24Hour onChange={(_event, date) => { setOpen(false); if (date) onChange(localTime(date)); }} />}</View>;
}

export function DangerConfirm({ title, message, visible, reason, setReason, onClose, onConfirm, busy }: { title: string; message: string; visible: boolean; reason?: string; setReason?: (value: string) => void; onClose: () => void; onConfirm: () => void; busy: boolean }) {
  return <FormModal title={title} visible={visible} onClose={onClose}><Text style={styles.text}>{message}</Text>{setReason && <Field label="Lý do hủy (bắt buộc)" value={reason || ""} onChange={setReason} multiline />}<Button title={busy ? "Đang xử lý..." : "Xác nhận"} disabled={busy || (!!setReason && (reason || "").trim().length < 3)} onPress={onConfirm} /><Button title="Quay lại" secondary disabled={busy} onPress={onClose} /></FormModal>;
}
