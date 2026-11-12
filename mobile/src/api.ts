import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import { Platform } from "react-native";

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL;
const expoHostUri = Constants.expoConfig?.hostUri;
const expoDevHost = expoHostUri?.split(":")[0];
const isLoopbackUrl = (value: string) => /localhost|127\.0\.0\.1|10\.0\.2\.2/i.test(value);
const nativeDevApiUrl = expoDevHost
  ? `http://${expoDevHost}:4000/api`
  : Platform.OS === "android"
    ? "http://10.0.2.2:4000/api"
    : "http://localhost:4000/api";
const BASE_URL = (
  Platform.OS !== "web" && configuredApiUrl && isLoopbackUrl(configuredApiUrl)
    ? nativeDevApiUrl
    : configuredApiUrl ?? (Platform.OS === "web" ? "http://localhost:4000/api" : nativeDevApiUrl)
).replace(/\/$/, "");

const TOKEN_KEY = "hairmatch_token";

let token: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function onUnauthorized(handler: () => void) {
  unauthorizedHandler = handler;
}

export async function restoreToken() {
  token = Platform.OS === "web"
    ? (typeof window !== "undefined" ? window.localStorage.getItem(TOKEN_KEY) : null)
    : await SecureStore.getItemAsync(TOKEN_KEY);
  return token;
}

export async function saveToken(value: string) {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.localStorage.setItem(TOKEN_KEY, value);
  } else {
    await SecureStore.setItemAsync(TOKEN_KEY, value);
  }
  token = value;
}

export async function clearToken() {
  token = null;
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.localStorage.removeItem(TOKEN_KEY);
  } else {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    form?: FormData;
    timeoutMs?: number;
  } = {}
): Promise<T> {
  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 15000
  );

  try {
    const headers: Record<string, string> = {};

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.form
        ? options.form
        : options.body !== undefined
          ? JSON.stringify(options.body)
          : undefined,
      signal: controller.signal
    });

    const text = await response.text();

    let data: any = null;

    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        throw new ApiError(
          response.status,
          "Máy chủ trả về dữ liệu không hợp lệ."
        );
      }
    }

    if (!response.ok) {
      if (
        response.status === 401 &&
        !path.startsWith("/auth/")
      ) {
        await clearToken();
        unauthorizedHandler?.();
      }

      throw new ApiError(
        response.status,
        data?.message ?? "Yêu cầu thất bại."
      );
    }

    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;

    if (
      error instanceof Error &&
      error.name === "AbortError"
    ) {
      throw new Error("Yêu cầu quá thời gian. Vui lòng thử lại.");
    }

    throw new Error(
      "Không kết nối được backend. Kiểm tra IP, mạng và cổng 4000."
    );
  } finally {
    clearTimeout(timer);
  }
}

