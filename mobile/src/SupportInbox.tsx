import React, { useEffect, useRef, useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { Avatar, Button, Card, ErrorText, Field, colors, dateTimeLabel, styles } from "./ui";
import { Choice, FormModal } from "./admin/components";

export type SupportEntry = {
  id: string;
  senderId: string;
  senderRole: "customer" | "barber" | "admin";
  senderName?: string;
  body: string;
  createdAt: string;
};

export type SupportMessage = {
  id: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  contactId?: string;
  contactName?: string;
  contactPhone?: string;
  contactRole?: "customer" | "barber" | "admin";
  senderId?: string;
  senderRole?: "customer" | "barber" | "admin";
  body: string;
  createdAt: string;
  updatedAt?: string;
  lastMessageAt?: string;
  lastMessageBody?: string;
  appointmentId?: string;
  leaveRequestId?: string;
  leaveRequestStatus?: "pending" | "approved" | "rejected";
  leaveFrom?: string;
  leaveTo?: string;
  leaveReason?: string;
  leaveBarberName?: string;
  leaveShifts?: { id: string; date: string; startTime: string; endTime: string }[];
  leaveAppointments?: { id: string; customerId: string; customerNameSnapshot: string; serviceNameSnapshot: string; startAt: string; status: string; walkIn?: boolean }[];
  readBy?: string[];
  reply?: string;
  repliedAt?: string;
  messages?: SupportEntry[];
};

export type CustomerSearchResult = { id: string; name: string; phone?: string; blacklisted?: boolean };
export type SupportContact = { id: string; name: string; phone?: string; role: "barber" | "admin"; barberId?: string; conversationId?: string; canMessage: boolean };

function dateLabel(value: string) {
  return new Date(value).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

function entriesFor(item: SupportMessage): SupportEntry[] {
  if (item.messages?.length) return item.messages;
  const entries: SupportEntry[] = [{ id: item.id + ":original", senderId: item.senderId || item.customerId || "unknown", senderRole: item.senderRole || "customer", senderName: item.customerName, body: item.body, createdAt: item.createdAt }];
  if (item.reply) entries.push({ id: item.id + ":reply", senderId: "legacy-admin", senderRole: "admin", senderName: "HairMatch", body: item.reply, createdAt: item.repliedAt || item.createdAt });
  return entries;
}

function counterpart(item: SupportMessage, role: "customer" | "barber" | "admin") {
  if (role !== "customer") return item.customerId ? item.customerName || "Khách hàng" : item.contactName || "Liên hệ salon";
  const staffEntry = [...entriesFor(item)].reverse().find((entry) => entry.senderRole !== "customer");
  return staffEntry?.senderName || "HairMatch · Salon hỗ trợ";
}

export function SupportInbox({ messages, contacts = [], viewerRole, viewerId, onCompose, onReply, onSearchCustomers, onRead, onLeaveDecision, focusLatest = false }: {
  messages: SupportMessage[];
  contacts?: SupportContact[];
  viewerRole: "customer" | "barber" | "admin";
  viewerId: string;
  onCompose: (body: string, recipientId?: string) => Promise<void>;
  onReply: (threadId: string, body: string) => Promise<void>;
  onSearchCustomers?: (query: string) => Promise<CustomerSearchResult[]>;
  onRead?: (threadId: string) => Promise<void>;
  onLeaveDecision?: (threadId: string, leaveRequestId: string, status: "approved" | "rejected", confirmCancelAppointments?: boolean) => Promise<void>;
  focusLatest?: boolean;
}) {
  const { width } = useWindowDimensions();
  const wide = width >= 760;
  const staff = viewerRole !== "customer";
  const [selectedId, setSelectedId] = useState("");
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [replyDraft, setReplyDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);
  const [error, setError] = useState("");
  const [inboxQuery, setInboxQuery] = useState("");
  const [query, setQuery] = useState("");
  const [searchedQuery, setSearchedQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<CustomerSearchResult[]>([]);
  const didAutoFocus = useRef(false);
  const onReadRef = useRef(onRead);
  useEffect(() => { onReadRef.current = onRead; }, [onRead]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchResult | null>(null);
  const [selectedContact, setSelectedContact] = useState<SupportContact | null>(null);
  const [customerBookingFilter, setCustomerBookingFilter] = useState("all");
  const [customerSort, setCustomerSort] = useState("name");
  const selected = messages.find((item) => item.id === selectedId);
  const selectedEntries = selected ? entriesFor(selected) : [];
  const directoryContacts = contacts.filter((contact) =>
    !contact.conversationId || !messages.some((item) => item.id === contact.conversationId));
  const normalizedInboxQuery = inboxQuery.trim().toLocaleLowerCase("vi-VN");
  const visibleThreads = normalizedInboxQuery ? messages.filter((item) => [
    counterpart(item, viewerRole), item.customerPhone || "", item.contactPhone || "",
    item.lastMessageBody || item.body, ...entriesFor(item).map((entry) => entry.body)
  ].join(" ").toLocaleLowerCase("vi-VN").includes(normalizedInboxQuery)) : messages;
  const visibleDirectoryContacts = normalizedInboxQuery ? directoryContacts.filter((contact) =>
    `${contact.name} ${contact.phone || ""}`.toLocaleLowerCase("vi-VN").includes(normalizedInboxQuery)) : directoryContacts;
  const visibleSearchResults = searchResults.filter((customer) =>
      (customerBookingFilter === "all" || (customerBookingFilter === "blocked" ? !!customer.blacklisted : !customer.blacklisted)))
    .sort((a, b) => customerSort === "phone" ? (a.phone || "").localeCompare(b.phone || "") : a.name.localeCompare(b.name, "vi"));
  const canReply = staff || Boolean(selected && selectedEntries.some((entry) => entry.senderRole === "barber" || entry.senderRole === "admin"));

  useEffect(() => {
    if ((wide || focusLatest) && !didAutoFocus.current && !composing && !selectedId && messages.length) {
      const priority = focusLatest ? messages.find((item) => item.leaveRequestStatus === "pending") : undefined;
      didAutoFocus.current = true;
      setSelectedId(priority?.id || messages[0].id);
    }
    else if (selectedId && !messages.some((item) => item.id === selectedId)) setSelectedId(wide ? messages[0]?.id || "" : "");
  }, [wide, focusLatest, messages, selectedId, composing]);

  useEffect(() => {
    if (selectedId && !composing) void onReadRef.current?.(selectedId);
  }, [selectedId, selected?.lastMessageAt, selected?.updatedAt, composing]);

  async function decideLeave(status: "approved" | "rejected", confirmCancelAppointments = false) {
    if (!selected?.leaveRequestId || !onLeaveDecision || decisionBusy) return;
    setDecisionBusy(true); setError("");
    try { await onLeaveDecision(selected.id, selected.leaveRequestId, status, confirmCancelAppointments); }
    catch (err: any) { setError(err.message || "Không xử lý được đơn nghỉ."); }
    finally { setDecisionBusy(false); }
  }
  function requestLeaveApproval() {
    if (selected?.leaveAppointments?.length) setConfirmLeaveOpen(true);
    else void decideLeave("approved");
  }

  async function searchCustomers() {
    if (!onSearchCustomers || query.trim().length < 2 || searching) return;
    setSearching(true); setError("");
    try { setSearchResults(await onSearchCustomers(query.trim())); setSearchedQuery(query.trim()); }
    catch (err: any) { setError(err.message || "Không tìm được khách hàng."); }
    finally { setSearching(false); }
  }

  async function send() {
    const body = draft.trim();
    const recipientId = selectedContact?.id || selectedCustomer?.id;
    if (body.length < 2 || busy || (staff && !recipientId)) return;
    setBusy(true); setError("");
    try {
      await onCompose(body, recipientId);
      setDraft(""); setComposing(false); setSelectedContact(null); setSelectedCustomer(null); setQuery(""); setSearchResults([]);
    } catch (err: any) { setError(err.message || "Không gửi được tin nhắn."); }
    finally { setBusy(false); }
  }

  async function reply() {
    const body = replyDraft.trim();
    if (!selected || body.length < 2 || busy || !canReply) return;
    setBusy(true); setError("");
    try { await onReply(selected.id, body); setReplyDraft(""); }
    catch (err: any) { setError(err.message || "Không gửi được phản hồi."); }
    finally { setBusy(false); }
  }

  const inbox = <View style={{ width: wide ? 320 : "100%", flexShrink: 0, borderRightWidth: wide ? 1 : 0, borderColor: colors.border }}>
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 6, padding: 12, borderBottomWidth: 1, borderColor: colors.border }}>
      <View><Text style={styles.subtitle}>Hòm thư</Text><Text style={styles.muted}>{messages.length + directoryContacts.length} người · {messages.length} cuộc trò chuyện</Text></View>
      <Button title={staff ? "Nhắn khách" : "Thư mới"} onPress={() => { setComposing(true); setSelectedId(""); setSelectedContact(null); setSelectedCustomer(null); setError(""); }} />
    </View>
    <View style={{ paddingHorizontal: 10, paddingTop: 10 }}><Field label="Tìm nhanh trong hòm thư" value={inboxQuery} onChange={setInboxQuery} /></View>
    {!visibleThreads.length && !visibleDirectoryContacts.length && <Text style={[styles.muted, { padding: 14 }]}>{normalizedInboxQuery ? "Không tìm thấy cuộc trò chuyện hoặc liên hệ phù hợp." : "Chưa có cuộc trò chuyện."}</Text>}
    {visibleThreads.map((item) => {
      const name = counterpart(item, viewerRole);
      const active = selectedId === item.id && !composing;
      const entries = entriesFor(item);
      const latest = entries[entries.length - 1];
      const unread = !!latest && latest.senderId !== viewerId && !item.readBy?.includes(viewerId);
      return <Pressable key={item.id} accessibilityRole="button" onPress={() => { setSelectedId(item.id); setSelectedContact(null); setComposing(false); setError(""); }} style={{ minHeight: 56, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 10, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.border, backgroundColor: active ? colors.card : "transparent" }}>
        <Avatar name={name} size={36} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 6 }}><Text style={[styles.text, { fontSize: 13, fontWeight: unread ? "700" : "500", flex: 1 }]} numberOfLines={1}>{name}</Text><Text style={[styles.muted, { fontSize: 10 }]}>{dateLabel(item.lastMessageAt || item.updatedAt || item.createdAt)}</Text></View>
          {staff && !!item.customerPhone && <Text style={[styles.muted, { fontSize: 10 }]} numberOfLines={1}>{item.customerPhone}</Text>}
          <Text style={[styles.muted, { fontSize: 11 }]} numberOfLines={1}>{item.lastMessageBody || item.body}</Text>
        </View>
      </Pressable>;
    })}
    {!!visibleDirectoryContacts.length && visibleDirectoryContacts.map((contact) => {
        const existing = contact.conversationId ? messages.find((item) => item.id === contact.conversationId) : undefined;
        const locked = viewerRole === "customer" && contact.role === "barber" && !contact.canMessage;
        const active = selectedContact?.id === contact.id && composing;
        return <Pressable key={`${contact.role}:${contact.id}`} disabled={locked} onPress={() => {
          setError(""); setSelectedCustomer(null); setSelectedContact(null);
          if (existing) { setSelectedId(existing.id); setComposing(false); }
          else if (viewerRole !== "customer" || contact.role === "admin") { setSelectedId(""); setSelectedContact(contact); setComposing(true); }
        }} style={{ minHeight: 56, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.border, opacity: locked ? 0.48 : 1, backgroundColor: active ? colors.card : "transparent" }}>
          <Avatar name={contact.name} size={35} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}><Text style={[styles.text, { fontSize: 13 }]} numberOfLines={1}>{contact.name}</Text><Text style={[styles.muted, { fontSize: 10 }]} numberOfLines={1}>{contact.phone || (contact.role === "admin" ? "Quản trị salon" : "Stylist")}</Text></View>
          <Text style={{ color: locked ? colors.muted : colors.gold, fontSize: 11, fontWeight: "700" }}>{locked ? "Chờ thợ nhắn" : existing ? "Mở thư" : "Nhắn tin"}</Text>
        </Pressable>;
      })}
  </View>;

  const composePanel = <View style={{ flex: 1, minWidth: 0, gap: 12, padding: wide ? 16 : 0 }}>
    <View style={{ paddingBottom: 10, borderBottomWidth: 1, borderColor: colors.border }}><Text style={styles.subtitle}>{selectedContact ? `Nhắn tin · ${selectedContact.name}` : staff ? "Nhắn tin cho khách" : "Thư mới gửi salon"}</Text><Text style={styles.muted}>{selectedContact ? selectedContact.phone || (selectedContact.role === "admin" ? "Quản trị salon" : "Stylist") : staff ? "Tìm khách theo tên hoặc số điện thoại." : "Thư mới được gửi tới quản trị viên salon."}</Text></View>
    {staff && !selectedContact && <>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}><View style={{ flex: 1 }}><Field label="Tên hoặc số điện thoại khách" value={query} onChange={(value) => { setQuery(value); setSelectedCustomer(null); setSearchResults([]); setSearchedQuery(""); }} /></View><Button title={searching ? "Đang tìm" : "Tìm"} disabled={searching || query.trim().length < 2} onPress={() => void searchCustomers()} /></View>
      {!!selectedCustomer && <Card style={{ padding: 11 }}><Text style={styles.text}>{selectedCustomer.name}</Text><Text style={styles.muted}>{selectedCustomer.phone || "Chưa có số điện thoại"}</Text><Button title="Đổi khách" secondary onPress={() => { setSelectedCustomer(null); setQuery(""); setSearchResults([]); }} /></Card>}
      {!!searchResults.length && !selectedCustomer && <><Text style={styles.muted}>Trạng thái đặt lịch</Text><Choice value={customerBookingFilter} onChange={setCustomerBookingFilter} options={[{ label: "Tất cả", value: "all" }, { label: "Bình thường", value: "normal" }, { label: "Đã chặn", value: "blocked" }]} /><Text style={styles.muted}>Sắp xếp kết quả</Text><Choice value={customerSort} onChange={setCustomerSort} options={[{ label: "Tên A–Z", value: "name" }, { label: "Số điện thoại", value: "phone" }]} />{!visibleSearchResults.length && <Text style={styles.muted}>Không có khách phù hợp với bộ lọc.</Text>}{visibleSearchResults.map((customer) => <Pressable key={customer.id} onPress={() => { setSelectedCustomer(customer); setSearchResults([]); }} style={[styles.card, { flexDirection: "row", alignItems: "center", gap: 9, padding: 10 }]}><Avatar name={customer.name} size={36} /><View style={{ flex: 1 }}><Text style={styles.text}>{customer.name}</Text><Text style={styles.muted}>{customer.phone || "Chưa có số điện thoại"}{customer.blacklisted ? " · Đã chặn đặt lịch" : ""}</Text></View><Text style={{ color: colors.gold, fontWeight: "700" }}>Chọn</Text></Pressable>)}</>}
      {!selectedCustomer && !!query && !searchResults.length && <Text style={styles.muted}>{searchedQuery === query.trim() ? "Không tìm thấy khách phù hợp." : "Nhập ít nhất 2 ký tự rồi bấm Tìm."}</Text>}
    </>}
    <Field label="Nội dung tin nhắn" value={draft} onChange={setDraft} multiline />
    <ErrorText message={error} />
    <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}><Button title="Hủy" secondary onPress={() => { setComposing(false); setDraft(""); setSelectedContact(null); setSelectedCustomer(null); setSearchResults([]); setError(""); }} /><Button title={busy ? "Đang gửi..." : "Gửi tin"} disabled={busy || draft.trim().length < 2 || (staff && !selectedCustomer && !selectedContact)} onPress={() => void send()} /></View>
  </View>;

  const thread = selected ? <View style={{ flex: 1, minWidth: 0, gap: 12, padding: wide ? 16 : 0 }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 10, borderBottomWidth: 1, borderColor: colors.border }}><Avatar name={counterpart(selected, viewerRole)} size={42} /><View style={{ flex: 1 }}><Text style={styles.subtitle}>{counterpart(selected, viewerRole)}</Text>{staff && !!(selected.customerPhone || selected.contactPhone) && <Text style={styles.muted}>{selected.customerPhone || selected.contactPhone}</Text>}<Text style={styles.muted}>{selected.appointmentId ? "Liên hệ từ lịch " + selected.appointmentId.slice(0, 8).toUpperCase() : selectedEntries.length + " tin nhắn"}</Text></View></View>
    {!!selected.leaveRequestId && <Card style={{ borderColor: selected.leaveRequestStatus === "pending" ? colors.gold : selected.leaveRequestStatus === "approved" ? colors.success : colors.danger }}>
      <Text style={styles.subtitle}>Đơn xin nghỉ · {selected.leaveFrom} → {selected.leaveTo}</Text>
      <Text style={styles.text}>Thợ: {selected.leaveBarberName || selected.contactName || "Thợ"}</Text>
      <Text style={styles.muted}>Lý do: {selected.leaveReason || selected.body}</Text>
      <Text style={[styles.muted, { fontWeight: "700" }]}>Ca làm sẽ bị gỡ · {selected.leaveShifts?.length || 0}</Text>
      {!!selected.leaveShifts?.length && selected.leaveShifts.map((shift) => <Text key={shift.id} style={styles.muted}>{shift.date} · {shift.startTime}–{shift.endTime}</Text>)}
      <Text style={{ color: selected.leaveAppointments?.length ? colors.danger : colors.success, fontWeight: "800" }}>
        {selected.leaveAppointments?.length ? `Cảnh báo: ${selected.leaveAppointments.length} lịch khách sẽ bị hủy nếu duyệt.` : "Không có lịch khách bị ảnh hưởng."}
      </Text>
      {!!selected.leaveAppointments?.length && selected.leaveAppointments.map((appointment) => <Text key={appointment.id} style={styles.muted}>
        {dateTimeLabel(appointment.startAt)} · {appointment.customerNameSnapshot} · {appointment.serviceNameSnapshot}
      </Text>)}
      <Text style={{ color: selected.leaveRequestStatus === "approved" ? colors.success : selected.leaveRequestStatus === "rejected" ? colors.danger : colors.gold, fontWeight: "700" }}>{selected.leaveRequestStatus === "approved" ? "Đã duyệt" : selected.leaveRequestStatus === "rejected" ? "Đã từ chối" : "Chờ admin xử lý"}</Text>
      {viewerRole === "admin" && selected.leaveRequestStatus === "pending" && !!onLeaveDecision && <View style={styles.row}>
        <Button title={decisionBusy ? "Đang xử lý..." : "Duyệt nghỉ"} disabled={decisionBusy} onPress={requestLeaveApproval} />
        <Button title="Không duyệt" secondary disabled={decisionBusy} onPress={() => void decideLeave("rejected")} />
      </View>}
    </Card>}
    <View style={{ gap: 8 }}>{selectedEntries.map((entry) => {
      const own = entry.senderRole === viewerRole;
      return <View key={entry.id} style={{ alignSelf: own ? "flex-end" : "flex-start", maxWidth: "92%", backgroundColor: own ? colors.input : colors.card, borderColor: own ? colors.gold : colors.border, borderWidth: 1, borderRadius: 13, padding: 11, gap: 4 }}><Text style={[styles.muted, { fontSize: 11, fontWeight: "700" }]}>{own ? "Bạn" : entry.senderName || (entry.senderRole === "admin" ? "HairMatch" : entry.senderRole === "barber" ? "Thợ" : selected.customerName || "Khách hàng")} · {dateLabel(entry.createdAt)}</Text><Text style={styles.text}>{entry.body}</Text></View>;
    })}</View>
    {canReply ? <View style={{ gap: 8, borderTopWidth: 1, borderColor: colors.border, paddingTop: 12 }}><Field label="Trả lời trong cuộc trò chuyện" value={replyDraft} onChange={setReplyDraft} multiline /><ErrorText message={error} /><View style={{ alignItems: "flex-end" }}><Button title={busy ? "Đang gửi..." : "Gửi trả lời"} disabled={busy || replyDraft.trim().length < 2} onPress={() => void reply()} /></View></View>
      : <Card><Text style={styles.muted}>Bạn có thể trả lời sau khi admin hoặc thợ đã nhắn trong cuộc trò chuyện này.</Text></Card>}
  </View> : <View style={{ flex: 1, minHeight: 220, alignItems: "center", justifyContent: "center", padding: 24 }}><Text style={styles.muted}>Chọn cuộc trò chuyện để xem tin nhắn.</Text></View>;

  return <View style={{ gap: 8 }}>
    <View style={{ flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}><Text style={styles.subtitle}>{viewerRole === "admin" ? "Hòm thư khách hàng" : viewerRole === "barber" ? "Hòm thư khách hàng" : "Hòm thư"}</Text><Text style={styles.muted}>Tự cập nhật mỗi 15 giây</Text></View>
    {wide ? <View style={{ flexDirection: "row", minHeight: 390, borderWidth: 1, borderColor: colors.border, borderRadius: 14, overflow: "hidden" }}>{inbox}{composing ? composePanel : thread}</View>
      : composing || selected ? <View style={{ gap: 10 }}><Button title="← Hòm thư" secondary onPress={() => { setComposing(false); setSelectedId(""); setError(""); }} /><View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12, gap: 10 }}>{composing ? composePanel : thread}</View></View>
        : <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 14, overflow: "hidden" }}>{inbox}</View>}
    <FormModal title="Xác nhận duyệt đơn nghỉ" visible={confirmLeaveOpen} onClose={() => { if (!decisionBusy) setConfirmLeaveOpen(false); }}>
      <Text style={styles.text}>Nếu duyệt, hệ thống sẽ gỡ {selected?.leaveShifts?.length || 0} ca và hủy {selected?.leaveAppointments?.length || 0} lịch khách trong thời gian nghỉ.</Text>
      <Text style={{ color: colors.danger, fontWeight: "800" }}>Chỉ khách có lịch bị hủy mới nhận tin xin lỗi riêng từ admin.</Text>
      {selected?.leaveAppointments?.map((appointment) => <Card key={appointment.id} style={{ padding: 11 }}>
        <Text style={styles.text}>{appointment.customerNameSnapshot} · {appointment.serviceNameSnapshot}</Text>
        <Text style={styles.muted}>{dateTimeLabel(appointment.startAt)}</Text>
      </Card>)}
      <View style={styles.row}>
        <Button title={decisionBusy ? "Đang xử lý..." : "Hủy lịch khách và duyệt nghỉ"} disabled={decisionBusy} onPress={() => { setConfirmLeaveOpen(false); void decideLeave("approved", true); }} />
        <Button title="Quay lại" secondary disabled={decisionBusy} onPress={() => setConfirmLeaveOpen(false)} />
      </View>
    </FormModal>
  </View>;
}
