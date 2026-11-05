import React, { useState } from "react";
import { View, Text, Image, Switch, Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { api } from "./api";
import { ConsultationResult } from "./types";
import {
  Button,
  Card,
  ErrorText,
  Loading,
  Page,
  styles,
  colors
} from "./ui";

interface ConsultationProps {
  onBookWithHaircut?: (haircutName: string, barberNote: string, suggestedService?: string) => void;
}

export function Consultation({ onBookWithHaircut }: ConsultationProps = {}) {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [consent, setConsent] = useState<boolean>(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ConsultationResult | null>(null);

  async function pickImage() {
    setError("");
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Quyền truy cập", "Cần cấp quyền truy cập thư viện ảnh để tải ảnh lên.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.8,
      aspect: [1, 1]
    });
    if (!res.canceled && res.assets && res.assets.length > 0) {
      setImageUri(res.assets[0].uri);
      setResult(null);
    }
  }

  async function takePhoto() {
    setError("");
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Quyền truy cập", "Cần cấp quyền truy cập camera để chụp ảnh khuôn mặt.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.8,
      aspect: [1, 1]
    });
    if (!res.canceled && res.assets && res.assets.length > 0) {
      setImageUri(res.assets[0].uri);
      setResult(null);
    }
  }

  async function handleSubmit() {
    if (!imageUri) {
      setError("Vui lòng chụp hoặc chọn ảnh khuôn mặt.");
      return;
    }
    if (!consent) {
      setError("Bạn cần đồng ý gửi ảnh để sử dụng chức năng tư vấn.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("consent", "true");
      formData.append("preferences", JSON.stringify({}));

      const uriParts = imageUri.split(".");
      const fileType = uriParts[uriParts.length - 1];

      // Format for react-native FormData file upload
      formData.append("image", {
        uri: imageUri,
        name: `photo.${fileType || "jpg"}`,
        type: `image/${fileType === "png" ? "png" : "jpeg"}`
      } as any);

      const res = await api<ConsultationResult>("/ai/consultations", {
        method: "POST",
        form: formData,
        timeoutMs: 45000
      });

      if (!res.imageAssessment.suitable) {
        setError(
          res.imageAssessment.message ||
            "Ảnh không nhận diện được khuôn mặt người trực diện. Vui lòng chụp lại ảnh khuôn mặt rõ nét."
        );
        setResult(null);
        return;
      }

      setResult(res);
    } catch (err: any) {
      setError(err.message || "Tư vấn AI thất bại. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Page>
      <Text style={styles.title}>AI Tư vấn kiểu tóc</Text>
      <Text style={styles.muted}>
        Chỉ cần chụp hoặc tải ảnh khuôn mặt trực diện rõ nét. AI Vision sẽ tự nhìn tỷ lệ khuôn mặt và mái tóc hiện tại để gợi ý 3 kiểu tóc phù hợp nhất.
      </Text>

      <ErrorText message={error} />

      {/* Image selector card */}
      <Card style={{ alignItems: "center", paddingVertical: 18, gap: 14 }}>
        {imageUri ? (
          <View style={{ alignItems: "center", gap: 12, width: "100%" }}>
            <Image
              source={{ uri: imageUri }}
              style={{
                width: 200,
                height: 200,
                borderRadius: 16,
                backgroundColor: "#222",
                borderWidth: 2,
                borderColor: colors.gold
              }}
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button title="📸 Chụp lại" secondary onPress={takePhoto} />
              <Button title="🖼️ Đổi ảnh khác" secondary onPress={pickImage} />
            </View>

            {/* Consent checkbox */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                marginTop: 6,
                paddingHorizontal: 8
              }}
            >
              <Switch
                value={consent}
                onValueChange={setConsent}
                trackColor={{ true: colors.gold, false: "#444" }}
              />
              <Text style={[styles.muted, { flex: 1, fontSize: 13 }]}>
                Đồng ý để AI phân tích dáng mặt và tóc trực tiếp từ ảnh.
              </Text>
            </View>

            {/* Submit button */}
            <View style={{ width: "100%", marginTop: 4 }}>
              <Button
                title={loading ? "🔍 Đang phân tích khuôn mặt..." : "⚡ Phân tích & Gợi ý kiểu tóc ngay"}
                onPress={handleSubmit}
                disabled={loading || !imageUri || !consent}
              />
            </View>
          </View>
        ) : (
          <View style={{ alignItems: "center", gap: 12, width: "100%", paddingVertical: 8 }}>
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                backgroundColor: "#222",
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: "#333"
              }}
            >
              <Text style={{ fontSize: 32 }}>📸</Text>
            </View>
            <Text style={[styles.subtitle, { fontSize: 16, textAlign: "center" }]}>
              Chưa có ảnh khuôn mặt
            </Text>
            <Text style={[styles.muted, { textAlign: "center", fontSize: 13, maxWidth: 320 }]}>
              Vui lòng chụp ảnh hoặc tải ảnh chân dung khuôn mặt trực diện, rõ nét, đủ ánh sáng. AI sẽ tự động nhìn phom mặt và đề xuất kiểu tóc.
            </Text>

            <View style={{ width: "100%", gap: 10, marginTop: 4 }}>
              <Button title="📸 Chụp ảnh bằng Camera" onPress={takePhoto} />
              <Button title="🖼️ Chọn ảnh từ thư viện" secondary onPress={pickImage} />
            </View>
          </View>
        )}
      </Card>

      {loading && <Loading />}

      {/* Consultation Result */}
      {result && (
        <View style={{ gap: 14 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={styles.title}>Kết quả tư vấn</Text>
            <View
              style={{
                backgroundColor: result.mode === "live" ? "#166534" : "#854d0e",
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 6
              }}
            >
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>
                Mode: {result.mode.toUpperCase()}
              </Text>
            </View>
          </View>

          {/* Assessment */}
          <Card>
            <Text style={[styles.subtitle, { color: colors.gold }]}>Đánh giá ảnh</Text>
            <Text style={styles.text}>
              {result.imageAssessment.suitable ? "Ảnh đạt yêu cầu phân tích." : "Ảnh chưa đạt yêu cầu."}
            </Text>
            <Text style={styles.muted}>{result.imageAssessment.message}</Text>
            <Text style={styles.text}>
              Ước tính dáng mặt: <Text style={{ color: colors.gold, fontWeight: "700" }}>{result.faceShapeEstimate}</Text>
            </Text>
            {result.observations.length > 0 && (
              <View style={{ marginTop: 6, gap: 4 }}>
                <Text style={[styles.muted, { fontWeight: "700" }]}>Quan sát:</Text>
                {result.observations.map((obs, i) => (
                  <Text key={i} style={styles.text}>• {obs}</Text>
                ))}
              </View>
            )}
          </Card>

          {/* Haircut recommendations */}
          {result.haircutRecommendations.length > 0 && (
            <View style={{ gap: 10 }}>
              <Text style={styles.subtitle}>Gợi ý 3 kiểu tóc phù hợp</Text>
              {result.haircutRecommendations.map((rec, idx) => (
                <Card key={idx}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={[styles.subtitle, { color: colors.gold, flex: 1 }]}>
                      {idx + 1}. {rec.name}
                    </Text>
                    {rec.direction && (
                      <View style={{ backgroundColor: "#262626", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                        <Text style={{ color: colors.gold, fontSize: 11, fontWeight: "600" }}>{rec.direction}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.text}>{rec.reason}</Text>
                  <Text style={styles.muted}>Độ dài: {rec.length}</Text>
                  <Text style={styles.muted}>Mức chăm sóc: {rec.maintenance}</Text>
                  {rec.feasibility && (
                    <Text style={[styles.text, { color: rec.feasibility.includes("Cần nuôi") ? "#fbbf24" : "#4ade80", fontSize: 13 }]}>
                      📌 {rec.feasibility}
                    </Text>
                  )}
                  {rec.stylingMethod && (
                    <Text style={[styles.muted, { fontSize: 13 }]}>
                      🧴 Cách tạo kiểu: {rec.stylingMethod}
                    </Text>
                  )}
                  {rec.suggestedService && (
                    <Text style={[styles.text, { fontSize: 13, color: colors.gold }]}>
                      💈 Dịch vụ tiệm: {rec.suggestedService}
                    </Text>
                  )}
                  <View style={{ backgroundColor: "#262626", padding: 10, borderRadius: 8, marginTop: 4 }}>
                    <Text style={[styles.muted, { fontSize: 13, color: colors.gold }]}>
                      Lưu ý cho thợ: {rec.barberNote}
                    </Text>
                  </View>
                  {onBookWithHaircut && (
                    <View style={{ marginTop: 8 }}>
                      <Button
                        title={`✂️ Đặt lịch kiểu tóc "${rec.name}"`}
                        onPress={() => onBookWithHaircut(rec.name, rec.barberNote, rec.suggestedService)}
                      />
                    </View>
                  )}
                </Card>
              ))}
            </View>
          )}

          {/* Color & Perm Advice */}
          <Card>
            <Text style={[styles.subtitle, { color: colors.gold }]}>Tư vấn màu sắc & Uốn tóc</Text>
            <Text style={[styles.text, { fontWeight: "700" }]}>Nhuộm tóc:</Text>
            <Text style={styles.text}>{result.colorAdvice.recommendation}</Text>
            {result.colorAdvice.suggestedColors.length > 0 && (
              <Text style={styles.muted}>
                Màu gợi ý: {result.colorAdvice.suggestedColors.join(", ")}
              </Text>
            )}
            <Text style={styles.muted}>{result.colorAdvice.reason}</Text>

            <View style={styles.divider} />

            <Text style={[styles.text, { fontWeight: "700" }]}>Uốn tóc:</Text>
            <Text style={styles.text}>{result.permAdvice.recommendation}</Text>
            <Text style={styles.muted}>{result.permAdvice.reason}</Text>
          </Card>

          {/* Disclaimer */}
          <Card>
            <Text style={[styles.muted, { fontSize: 13, fontStyle: "italic" }]}>
              {result.disclaimer}
            </Text>
          </Card>
        </View>
      )}
    </Page>
  );
}

