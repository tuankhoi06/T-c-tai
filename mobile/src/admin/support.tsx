import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { api } from "../api";
import { SupportInbox, type CustomerSearchResult, type SupportContact, type SupportMessage } from "../SupportInbox";
import { styles } from "../ui";
import { DataState, useAdminList } from "./components";

export function SupportAdmin({ active, viewerId }: { active: boolean; viewerId: string }) {
  const list = useAdminList<SupportMessage[]>("/admin/support/messages", active);
  const messages = list.data || [];
  const [contacts, setContacts] = useState<SupportContact[]>([]);

  async function loadContacts() {
    setContacts(await api<SupportContact[]>("/messaging/contacts"));
  }

  useEffect(() => {
    if (!active) return;
    let live = true;
    const refresh = async () => { try { await loadContacts(); } catch { if (live) setContacts([]); } };
    void refresh();
    const timer = setInterval(() => { void list.reload(true); void refresh(); }, 15000);
    return () => { live = false; clearInterval(timer); };
  }, [active, list.reload]);

  async function send(body: string, recipientId?: string) {
    if (!recipientId) throw new Error("Hãy chọn người nhận trước khi gửi.");
    await api("/messages", { method: "POST", body: { recipientId, message: body } });
    await Promise.all([list.reload(true), loadContacts()]);
  }
  async function reply(threadId: string, body: string) {
    await api("/messages/" + threadId + "/reply", { method: "POST", body: { body } });
    await Promise.all([list.reload(true), loadContacts()]);
  }
  async function markRead(threadId: string) {
    await api(`/messages/${threadId}/read`, { method: "POST" });
    await list.reload(true);
  }
  async function decideLeave(_threadId: string, leaveRequestId: string, status: "approved" | "rejected", confirmCancelAppointments = false) {
    await api(`/admin/leaves/${leaveRequestId}`, { method: "PATCH", body: { status, confirmCancelAppointments } });
    await list.reload(true);
  }
  async function searchCustomers(query: string) {
    return api<CustomerSearchResult[]>("/customers/search?q=" + encodeURIComponent(query));
  }

  return <View style={{ gap: 10 }}>
    <Text style={styles.muted}>Chọn một trong các thợ trong danh bạ hoặc tìm khách theo tên/số điện thoại. Danh bạ tự đồng bộ mỗi 15 giây.</Text>
    <DataState loading={list.loading} error={list.error} retry={() => void list.reload()} />
    {!list.loading && !list.error && <SupportInbox messages={messages} contacts={contacts} viewerRole="admin" viewerId={viewerId} focusLatest onCompose={send} onReply={reply} onSearchCustomers={searchCustomers} onRead={markRead} onLeaveDecision={decideLeave} />}
  </View>;
}
