import React, { useEffect, useState } from "react";
import { Text } from "react-native";
import { api } from "./api";
import { Button, ErrorText, Field, colors, styles } from "./ui";
import { FormModal } from "./admin/components";

export function QuickContactModal({ visible, customerId, customerName, appointmentId, onClose, onSent }: {
  visible: boolean;
  customerId?: string;
  customerName: string;
  appointmentId?: string;
  onClose: () => void;
  onSent?: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (visible) { setDraft(""); setBusy(false); setError(""); setSent(false); }
  }, [visible, customerId, appointmentId]);

  async function send() {
    if (!customerId || draft.trim().length < 2 || busy) return;
    setBusy(true); setError("");
    try {
      await api("/messages", { method: "POST", body: { customerId, message: draft.trim(), ...(appointmentId ? { appointmentId } : {}) } });
      setSent(true); onSent?.();
    } catch (err: any) { setError(err.message || "Không gửi được tin nhắn."); }
    finally { setBusy(false); }
  }

  return <FormModal visible={visible} title="Liên hệ khách nhanh" onClose={onClose}>
    {sent ? <><Text style={[styles.subtitle, { color: colors.success }]}>Đã gửi tin cho {customerName}.</Text><Text style={styles.muted}>Cuộc trò chuyện đã được thêm vào hộp thư.</Text><Button title="Đóng" onPress={onClose} /></>
      : <><Text style={styles.text}>Khách: {customerName}</Text>{appointmentId && <Text style={styles.muted}>Lịch {appointmentId.slice(0, 8).toUpperCase()}</Text>}
        {!customerId && <Text style={styles.error}>Lịch này chưa liên kết với tài khoản khách có hộp thư.</Text>}
        <Field label="Tin nhắn" value={draft} onChange={setDraft} multiline />
        <ErrorText message={error} />
        <Button title={busy ? "Đang gửi..." : "Gửi tin nhắn"} disabled={!customerId || busy || draft.trim().length < 2} onPress={() => void send()} />
      </>}
  </FormModal>;
}
