export const salonPhone = process.env.EXPO_PUBLIC_SALON_PHONE?.trim() || "0900 000 000";

// Hien thi ro la du lieu demo; thay bang dia chi thuc te truoc khi dua app vao su dung.
export const demoBranches = [
  { id: "demo-1", name: "HairMatch Vintage · Chi nhánh demo 1", address: "12 Đường Demo Barbershop, Phường Demo, TP. Hồ Chí Minh" },
  { id: "demo-2", name: "HairMatch Vintage · Chi nhánh demo 2", address: "28 Đại lộ Tông-đơ, Khu Demo, TP. Hồ Chí Minh" },
  { id: "demo-3", name: "HairMatch Vintage · Chi nhánh demo 3", address: "05 Ngõ Kéo Cổ Điển, Phường Demo, Hà Nội" }
];

export const salonAddress = process.env.EXPO_PUBLIC_SALON_ADDRESS?.trim() || demoBranches[0].address;
export const mapsUrlFor = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
export const salonMapsUrl = mapsUrlFor(salonAddress);
