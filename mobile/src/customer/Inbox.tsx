import React, { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { api } from "../api";
import { SupportInbox, type SupportContact, type SupportMessage } from "../SupportInbox";
import { ErrorText, styles } from "../ui";

export function CustomerInbox({ viewerId }: { viewerId: string }) {
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [contacts, setContacts] = useState<SupportContact[]>([]);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    const [items, people] = await Promise.all([api<SupportMessage[]>("/support/messages/me"), api<SupportContact[]>("/messaging/contacts")]);
    setMessages(items); setContacts(people); setError("");
  }, []);
  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const [items, people] = await Promise.all([api<SupportMessage[]>("/support/messages/me"), api<SupportContact[]>("/messaging/contacts")]);
        if (live) { setMessages(items); setContacts(people); setError(""); }
      } catch (err: any) { if (live) setError(err.message || "Không tải được hòm thư."); }
    };
    void load();
    const timer = setInterval(() => { void load(); }, 15000);
    return () => { live = false; clearInterval(timer); };
  }, []);
  async function send(body: string) {
    await api("/support/messages", { method: "POST", body: { body } });
    await refresh();
  }
  async function reply(threadId: string, body: string) {
    await api(`/messages/${threadId}/reply`, { method: "POST", body: { body } });
    await refresh();
  }
  async function markRead(threadId: string) {
    await api(`/messages/${threadId}/read`, { method: "POST" });
    await refresh();
  }
  return <View style={{ gap: 10 }}>
    <Text style={styles.muted}>Tin nhắn từ quản trị viên và thợ sẽ được gom tại đây.</Text>
    <ErrorText message={error} />
    <SupportInbox messages={messages} contacts={contacts} viewerRole="customer" viewerId={viewerId} onCompose={send} onReply={reply} onRead={markRead} />
  </View>;
}
