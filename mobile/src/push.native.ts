import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { api } from "./api";

let registeredToken: string | null = null;

export async function registerPushToken() {
  try {
    if (Platform.OS === "android") await Notifications.setNotificationChannelAsync("appointments", {
      name: "Lịch hẹn HairMatch", importance: Notifications.AndroidImportance.HIGH
    });
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) return;
    const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await api("/push-tokens", { method: "POST", body: { token } });
    registeredToken = token;
  } catch {
    // Thiết bị không có dịch vụ push vẫn dùng được hộp thông báo trong app.
  }
}

export async function unregisterPushToken() {
  if (!registeredToken) return;
  try { await api("/push-tokens", { method: "DELETE", body: { token: registeredToken } }); }
  catch { /* Phiên đã hết hạn sẽ được đăng ký lại ở lần đăng nhập sau. */ }
  registeredToken = null;
}
