import React, { useState } from "react";
import { Image, ImageBackground, Linking, Pressable, Text, View } from "react-native";
import type { Appointment, Barber, HairService, Notification, Voucher } from "../types";
import { Avatar, Button, Card, DragScrollView, Field, ShopClock, colors, dateTimeLabel, money, styles } from "../ui";
import { photos, servicePhoto } from "../visuals";
import { salonAddress, salonMapsUrl } from "./salon";
import type { BookingPreset } from "./Booking";

const inspirations = [
  { name: "Texture fade", note: "Gọn hai bên, giữ độ phồng tự nhiên", photo: photos.cutClose },
  { name: "Tạo kiểu cổ điển", note: "Trao đổi độ dài và đường viền với thợ", photo: photos.blowDry },
  { name: "Grooming & râu", note: "Cắt tóc kết hợp chăm sóc râu", photo: photos.beard },
  { name: "Classic barber", note: "Tham khảo dáng tóc và đường viền", photo: photos.classicCut },
  { name: "Cắt tóc truyền thống", note: "Kiểu gọn gàng để trao đổi cùng thợ", photo: photos.consultation }
];
const studioDetails = [
  { name: "Dụng cụ trên khay gỗ", photo: photos.woodenTools },
  { name: "Kéo và dao cạo", photo: photos.razorTools },
  { name: "Ghế barber cổ điển", photo: photos.chairDetail }
];

export function CustomerHome({ name, services, barbers, appointments, vouchers, notifications, onBook, onBookings, onNotifications }: {
  name: string; services: HairService[]; barbers: Barber[]; appointments: Appointment[]; vouchers: Voucher[]; notifications: Notification[];
  onBook: (preset?: BookingPreset) => void; onBookings: () => void; onNotifications: () => void;
}) {
  const [query, setQuery] = useState("");
  const browseMode = !query.trim();
  const next = appointments.filter((item) => ["pending", "confirmed", "in_progress"].includes(item.status) &&
    (item.status === "in_progress" || new Date(item.startAt).getTime() >= Date.now()))
    .sort((a, b) => a.startAt.localeCompare(b.startAt))[0];
  const needle = query.toLocaleLowerCase("vi-VN");
  const filteredServices = services.filter((item) =>
    `${item.name} ${item.description}`.toLocaleLowerCase("vi-VN").includes(needle));
  const filteredBarbers = barbers.filter((item) =>
    `${item.name} ${item.bio}`.toLocaleLowerCase("vi-VN").includes(needle));
  return <View style={{ gap: 18 }}>
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <View><Text style={[styles.muted, { fontSize: 11, letterSpacing: 1.5, fontWeight: "700" }]}>CLASSIC BARBERSHOP</Text><Text style={[styles.title, { color: colors.text, fontSize: 25 }]}>Chào {name}</Text></View>
      {!!notifications.some((item) => !item.read) && <Pressable onPress={onNotifications} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.card, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border }}><Text style={{ color: colors.gold, fontSize: 18 }}>●</Text></Pressable>}
    </View>
    <Field label="Tìm dịch vụ hoặc thợ" value={query} onChange={setQuery} />
    {query.trim() && !filteredServices.length && <Text style={styles.muted}>Không tìm thấy dịch vụ phù hợp.</Text>}
    {query.trim() && !filteredBarbers.length && <Text style={styles.muted}>Không tìm thấy thợ phù hợp.</Text>}
    <Text style={[styles.muted, { fontSize: 12 }]}>⌖  {salonAddress || "HairMatch · Một chi nhánh"}</Text>
    <ShopClock />
    {next && <Card style={{ borderColor: colors.gold, padding: 14, gap: 6 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><Text style={[styles.muted, { fontSize: 11, fontWeight: "700", letterSpacing: 0.7 }]}>LỊCH HẸN SẮP TỚI</Text><Text style={{ color: colors.gold, fontWeight: "700", fontSize: 12 }}>{next.status === "confirmed" ? "ĐÃ XÁC NHẬN" : next.status === "in_progress" ? "ĐANG PHỤC VỤ" : "CHỜ XÁC NHẬN"}</Text></View>
      <Text style={[styles.subtitle, { fontSize: 17 }]}>{dateTimeLabel(next.startAt)}</Text><Text style={styles.muted}>{next.serviceNameSnapshot} · {next.barberNameSnapshot}</Text>
      <View style={styles.row}><Button title="Xem lịch" onPress={onBookings} />{!!salonMapsUrl && <Button title="Chỉ đường" secondary onPress={() => void Linking.openURL(salonMapsUrl)} />}</View>
    </Card>}
    <ImageBackground source={photos.hero} resizeMode="cover" imageStyle={{ borderRadius: 16 }} style={{ minHeight: 235, borderRadius: 16, overflow: "hidden", justifyContent: "flex-end" }}>
      <View style={{ minHeight: 235, justifyContent: "flex-end", padding: 18, backgroundColor: colors.photoOverlay, gap: 8 }}>
        <Text style={{ color: colors.cream, fontSize: 25, fontWeight: "800", maxWidth: 430 }}>Một giờ cho phong cách của bạn.</Text>
        <Text style={{ color: colors.text, fontSize: 14 }}>Chọn dịch vụ, giờ trống và đặt lịch trong vài bước.</Text>
        <View style={{ alignSelf: "flex-start", marginTop: 3 }}><Button title="Đặt lịch nhanh  →" onPress={() => onBook()} /></View>
      </View>
    </ImageBackground>
    {browseMode && !!vouchers.length && <View style={{ gap: 8 }}><Text style={styles.subtitle}>Ưu đãi của bạn</Text><DragScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{vouchers.slice(0, 4).map((item) => <Pressable key={item.id} onPress={() => onBook({ voucherCode: item.code })} style={[styles.card, { minWidth: 210, padding: 13, borderColor: colors.gold }]}><Text style={{ color: colors.gold, fontWeight: "800", fontSize: 16 }}>{item.code}</Text><Text style={styles.muted}>{item.kind === "percent" ? `Giảm ${item.value}%` : `Giảm ${money(item.value)}`} · đến {item.to}</Text></Pressable>)}</DragScrollView></View>}
    <View style={{ gap: 9 }}><View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><Text style={styles.subtitle}>Dịch vụ</Text><Pressable onPress={() => onBook()}><Text style={{ color: colors.gold, fontWeight: "700" }}>Đặt lịch ngay →</Text></Pressable></View>
      <DragScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 8 }}>{filteredServices.map((item) => <Pressable key={item.id} onPress={() => onBook({ serviceIds: [item.id] })} style={[styles.card, { width: 210, padding: 0, overflow: "hidden", gap: 0 }]}>
        <Image source={item.imageUrl ? { uri: item.imageUrl } : servicePhoto(item.name)} style={{ width: "100%", height: 120 }} resizeMode="cover" />
        <View style={{ padding: 12, gap: 4 }}><Text style={[styles.text, { fontWeight: "700" }]} numberOfLines={1}>{item.name}</Text><Text style={styles.muted} numberOfLines={1}>{item.durationMinutes} phút · {money(item.promotionPrice ?? item.price)}</Text><Text style={{ color: colors.gold, fontSize: 12, fontWeight: "700" }}>Chọn dịch vụ →</Text></View>
      </Pressable>)}</DragScrollView>
      <Text style={[styles.muted, { fontSize: 11 }]}>Vuốt ngang để xem thêm dịch vụ →</Text>
    </View>
    {browseMode && <View style={{ gap: 8 }}><Text style={styles.subtitle}>Cảm hứng từ tiệm</Text><Text style={[styles.muted, { fontSize: 12 }]}>Ảnh chụp thật tại barbershop; kiểu tóc bên dưới là gợi ý để trao đổi với thợ.</Text>
      <DragScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>{inspirations.map((item) => <Pressable key={item.name} onPress={() => onBook({ serviceIds: services.some((service) => service.id === "cut") ? ["cut"] : [], styleName: item.name, note: item.note })} style={[styles.card, { width: 245, padding: 0, overflow: "hidden", gap: 0 }]}>
        <Image source={item.photo} style={{ width: "100%", height: 140 }} resizeMode="cover" /><View style={{ padding: 12, gap: 3 }}><Text style={[styles.text, { fontWeight: "700" }]}>{item.name}</Text><Text style={styles.muted} numberOfLines={2}>{item.note}</Text></View>
      </Pressable>)}</DragScrollView>
    </View>}
    {browseMode && <View style={{ gap: 8 }}><Text style={styles.subtitle}>Không gian & đồ nghề</Text><DragScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>{studioDetails.map((item) => <View key={item.name} style={[styles.card, { width: 190, padding: 0, overflow: "hidden", gap: 0 }]}><Image source={item.photo} style={{ width: "100%", height: 118 }} resizeMode="cover" /><Text style={[styles.text, { padding: 11, fontWeight: "700" }]}>{item.name}</Text></View>)}</DragScrollView></View>}
    {!!filteredBarbers.length && <View style={{ gap: 8 }}><Text style={styles.subtitle}>Đội ngũ thợ</Text>{filteredBarbers.map((item) => <Pressable key={item.id} onPress={() => onBook({ barberId: item.id })} style={[styles.card, { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 }]}>
      <Avatar name={item.name} uri={item.imageUrl || undefined} size={46} /><View style={{ flex: 1 }}><Text style={[styles.text, { fontWeight: "700" }]}>{item.name} · {item.title === "master" ? "Master" : item.title === "top" ? "Top Stylist" : "Stylist"}</Text><Text style={styles.muted}>{item.ratingAverage == null ? "Chưa có đánh giá" : `★ ${item.ratingAverage}/5`}</Text></View><Text style={{ color: colors.gold, fontWeight: "700" }}>Chọn →</Text>
    </Pressable>)}</View>}
  </View>;
}
