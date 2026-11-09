import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { api } from "../api";
import { Button, Card, ErrorText, Field, styles } from "../ui";
import { DataState, useAdminList } from "./components";

type Message = { id: string; customerId: string; customerName: string; body: string; createdAt: string; reply?: string; repliedAt?: string };
export function SupportAdmin({ active }: { active: boolean }) {
  const list = useAdminList<Message[]>("/admin/support/messages", active);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { if (!active) return; const timer = setInterval(() => { void list.reload(true); }, 15000); return () => clearInterval(timer); }, [active, list.reload]);
  async function reply(id: string) {
    const value = drafts[id]?.trim(); if (!value || busy) return;
    setBusy(id); setError("");
    try { await api(`/admin/support/messages/${id}/reply`, { method: "PATCH", body: { reply: value } });
      setDrafts((items) => ({ ...items, [id]: "" })); await list.reload(true);
    } catch (err: any) { setError(err.message || "Không gửi được trả lời."); }
    finally { setBusy(""); }
  }
  return <View style={{ gap: 10 }}><Text style={styles.subtitle}>Hỗ trợ khách hàng</Text><Text style={styles.muted}>Tin nhắn mới tự cập nhật mỗi 15 giây.</Text>
    <ErrorText message={error} /><DataState loading={list.loading} error={list.error} retry={() => void list.reload()} />
    {!list.data?.length && <Card><Text style={styles.muted}>Chưa có tin nhắn.</Text></Card>}
    {list.data?.map((item) => <Card key={item.id}><Text style={styles.text}>{item.customerName}</Text><Text style={styles.muted}>{new Date(item.createdAt).toLocaleString("vi-VN")}</Text><Text style={styles.text}>{item.body}</Text>
      {item.reply && <Text style={styles.muted}>Đã trả lời: {item.reply}</Text>}
      <Field label="Phản hồi" value={drafts[item.id] || ""} onChange={(value) => setDrafts((items) => ({ ...items, [item.id]: value }))} multiline />
      <Button title={busy === item.id ? "Đang gửi..." : "Gửi trả lời"} disabled={!!busy || (drafts[item.id] || "").trim().length < 2} onPress={() => void reply(item.id)} />
    </Card>)}
  </View>;
}
