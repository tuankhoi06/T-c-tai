import { randomUUID } from "node:crypto";
import type { Repository } from "./repository.js";
import type { Role, SupportMessage, SupportThreadEntry, User } from "./models.js";

export const barberParticipantId = (barberId: string) => `barber:${barberId}`;

export function supportEntries(item: SupportMessage): SupportThreadEntry[] {
  if (item.messages?.length) return item.messages;
  const senderId = item.senderId || item.customerId || item.participantIds?.[0] || "unknown";
  const entries: SupportThreadEntry[] = [{
    id: `${item.id}:original`, senderId, senderRole: item.senderRole || "customer", body: item.body, createdAt: item.createdAt
  }];
  if (item.reply) entries.push({
    id: `${item.id}:legacy-reply`, senderId: "legacy-admin", senderRole: "admin", body: item.reply,
    createdAt: item.repliedAt || item.createdAt
  });
  return entries;
}

function identity(repo: Repository, id: string) {
  if (id.startsWith("barber:")) {
    const barber = repo.barbers.get(id.slice("barber:".length));
    const account = barber && repo.users.all().find((user) => user.role === "barber" && user.barberId === barber.id);
    return barber ? { id, name: barber.name, phone: account?.phone || barber.phone, role: "barber" as const } : undefined;
  }
  const user = repo.users.get(id);
  if (user) {
    if (user.role === "barber" && user.barberId) {
      const barber = repo.barbers.get(user.barberId);
      if (barber) return { id, name: barber.name, phone: user.phone || barber.phone, role: "barber" as const };
    }
    return { id, name: user.name, phone: user.phone, role: user.role };
  }
  return undefined;
}

export function supportThreadView(item: SupportMessage, repo: Repository, viewerId?: string) {
  const messages = supportEntries(item).map((entry) => ({
    ...entry,
    senderName: identity(repo, entry.senderId)?.name || (entry.senderRole === "admin" ? "HairMatch" : "Người gửi")
  }));
  const viewer = viewerId ? repo.users.get(viewerId) : undefined;
  const viewerParticipantId = viewer?.role === "barber" && viewer.barberId ? barberParticipantId(viewer.barberId) : viewerId;
  let counterpartId = [...messages].reverse().find((entry) => entry.senderId !== viewerId)?.senderId;
  if (!counterpartId) counterpartId = item.contactId ? (item.contactRole === "barber" ? barberParticipantId(item.contactId) : item.contactId) : undefined;
  if (viewer?.role === "customer") {
    counterpartId = [...messages].reverse().find((entry) => entry.senderRole !== "customer")?.senderId ||
      (item.contactRole === "barber" && item.contactId ? barberParticipantId(item.contactId) : item.contactId);
  }
  if (viewer?.role !== "customer" && item.customerId && item.customerId !== viewerId) counterpartId = item.customerId;
  if (counterpartId === viewerParticipantId && item.contactId) {
    counterpartId = item.contactRole === "barber" ? barberParticipantId(item.contactId) : item.contactId;
  }
  const contact = counterpartId ? identity(repo, counterpartId) : undefined;
  const customer = item.customerId ? repo.users.get(item.customerId) : undefined;
  const latest = messages[messages.length - 1];
  return {
    ...item,
    messages,
    customerName: customer?.name,
    customerPhone: customer?.phone,
    contactName: contact?.name || (item.contactRole === "admin" ? "HairMatch · Salon" : undefined),
    contactPhone: contact?.phone,
    contactRole: contact?.role || item.contactRole,
    senderRole: messages[0]?.senderRole || item.senderRole || "customer",
    lastMessageAt: latest?.createdAt || item.updatedAt || item.createdAt,
    lastMessageBody: latest?.body || item.body
  };
}

export function makeSupportThread(input: {
  sender: User;
  recipient: User | { id: string; role: Role; name?: string; phone?: string; barberId?: string };
  body: string;
  customerId?: string;
  contactId?: string;
  contactRole?: Role;
  participantIds?: string[];
  appointmentId?: string;
}): SupportMessage {
  const createdAt = new Date().toISOString();
  const message: SupportThreadEntry = {
    id: randomUUID(), senderId: input.sender.id, senderRole: input.sender.role, body: input.body, createdAt
  };
  const recipientIdentity = input.recipient.role === "barber" && input.recipient.barberId
    ? barberParticipantId(input.recipient.barberId) : input.recipient.id;
  const customerId = input.customerId || (input.sender.role === "customer" ? input.sender.id : undefined) ||
    (input.recipient.role === "customer" ? input.recipient.id : undefined);
  return {
    id: randomUUID(), ...(customerId ? { customerId } : {}),
    ...(input.contactId ? { contactId: input.contactId } : {}),
    contactRole: input.contactRole || input.recipient.role,
    senderId: input.sender.id, senderRole: input.sender.role,
    body: input.body, createdAt, updatedAt: createdAt,
    participantIds: [...new Set([input.sender.id,
      ...(input.sender.role === "barber" && input.sender.barberId ? [barberParticipantId(input.sender.barberId)] : []),
      recipientIdentity, ...(input.participantIds || [])])],
    readBy: [input.sender.id, ...(input.sender.role === "barber" && input.sender.barberId ? [barberParticipantId(input.sender.barberId)] : [])],
    ...(input.appointmentId ? { appointmentId: input.appointmentId } : {}), messages: [message]
  };
}

export function appendSupportEntry(item: SupportMessage, sender: User, body: string): SupportMessage {
  const createdAt = new Date().toISOString();
  const entry: SupportThreadEntry = { id: randomUUID(), senderId: sender.id, senderRole: sender.role, body, createdAt };
  const participantIdentity = sender.role === "barber" && sender.barberId ? barberParticipantId(sender.barberId) : sender.id;
  return {
    ...item,
    updatedAt: createdAt,
    participantIds: [...new Set([...(item.participantIds || []), sender.id, participantIdentity])],
    // Read state applies to the latest entry; previous reads must not hide a new message.
    readBy: [...new Set([sender.id, participantIdentity])],
    messages: [...supportEntries(item), entry],
    ...(sender.role === "customer" ? {} : { reply: body, repliedAt: createdAt })
  };
}

export function canSeeSupportThread(item: SupportMessage, user: User) {
  if (item.customerId === user.id || item.participantIds?.includes(user.id) === true ||
      supportEntries(item).some((entry) => entry.senderId === user.id)) return true;
  if (user.role === "admin" && !!item.customerId && item.contactRole !== "barber" &&
      !supportEntries(item).some((entry) => entry.senderRole === "barber") &&
      (item.contactId === user.id || !item.contactRole)) return true;
  if (user.role === "barber" && user.barberId) {
    const profileId = barberParticipantId(user.barberId);
    return item.participantIds?.includes(profileId) === true || item.contactId === user.barberId && item.contactRole === "barber";
  }
  return false;
}

export function isStaffRole(role: Role) {
  return role === "admin" || role === "barber";
}

/** Collapse legacy customer↔admin threads so apologies/replies stay in one inbox conversation. */
export function mergeDuplicateCustomerAdminThreads(repo: Repository) {
  const groups = new Map<string, SupportMessage[]>();
  for (const item of repo.supportMessages.all()) {
    if (!item.customerId || item.contactRole === "barber" || supportEntries(item).some((entry) => entry.senderRole === "barber")) continue;
    const group = groups.get(item.customerId) || [];
    group.push(item);
    groups.set(item.customerId, group);
  }
  const admin = repo.users.all().find((user) => user.role === "admin");
  for (const group of groups.values()) {
    const byTime = [...group].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const latest = [...group].sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt))[0];
    const entries = byTime.flatMap(supportEntries).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const uniqueEntries = entries.filter((entry, index) => entries.findIndex((candidate) =>
      candidate.senderId === entry.senderId && candidate.body === entry.body && candidate.createdAt === entry.createdAt) === index);
    const first = uniqueEntries[0];
    const last = uniqueEntries[uniqueEntries.length - 1];
    const merged: SupportMessage = {
      ...byTime[0],
      contactId: admin?.id || latest.contactId,
      contactRole: "admin",
      senderId: first.senderId,
      senderRole: first.senderRole,
      body: first.body,
      createdAt: first.createdAt,
      updatedAt: last.createdAt,
      participantIds: [...new Set([...group.flatMap((item) => item.participantIds || []), ...(admin ? [admin.id] : []), byTime[0].customerId])],
      readBy: latest.readBy || [],
      messages: uniqueEntries,
      ...(last.senderRole === "customer" ? { reply: undefined, repliedAt: undefined } : { reply: last.body, repliedAt: last.createdAt })
    };
    repo.supportMessages.put(merged);
    for (const duplicate of group) if (duplicate.id !== merged.id) repo.supportMessages.remove(duplicate.id);
  }
}
