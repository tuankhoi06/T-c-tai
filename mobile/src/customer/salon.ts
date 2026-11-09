export const salonAddress = process.env.EXPO_PUBLIC_SALON_ADDRESS?.trim() || "";
export const salonPhone = process.env.EXPO_PUBLIC_SALON_PHONE?.trim() || "";
export const salonMapsUrl = salonAddress
  ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(salonAddress)}`
  : "";
