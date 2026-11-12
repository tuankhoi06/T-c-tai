import React, { useEffect, useState } from "react";
import { View, Text, Image, ImageBackground, Switch, Alert, Platform } from "react-native";
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
import { photos } from "./visuals";

interface ConsultationProps {
  onBookWithHaircut?: (haircutName: string, barberNote: string, suggestedService?: string) => void;
}

export function Consultation({ onBookWithHaircut }: ConsultationProps = {}) {
  const [aiStatus, setAiStatus] = useState<{ aiMode?: string; aiProvider?: string } | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageAsset, setImageAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [consent, setConsent] = useState<boolean>(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ConsultationResult | null>(null);

  useEffect(() => {
    let active = true;
    const refreshAIStatus = () => {
      void api<{ aiMode?: string; aiProvider?: string }>("/health")
        .then((status) => { if (active) setAiStatus(status); })
        .catch(() => { if (active) setAiStatus({ aiMode: "unavailable" }); });
    };
    refreshAIStatus();
    const timer = setInterval(refreshAIStatus, 15_000);
    return () => { active = false; clearInterval(timer); };
  }, []);

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
      setImageAsset(res.assets[0]);
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
      setImageAsset(res.assets[0]);
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

      const mimeType = imageAsset?.mimeType || imageAsset?.file?.type || "image/jpeg";
      const extension = mimeType === "image/png" ? "png" : "jpg";
      const fileName = imageAsset?.file?.name || imageAsset?.fileName || `photo.${extension}`;

      if (Platform.OS === "web") {
        // On web FormData needs a real Blob/File. The { uri, name, type } shape
        // is only understood by React Native's native networking layer.
        const imageFile = imageAsset?.file ?? await fetch(imageUri).then((response) => {
          if (!response.ok) throw new Error("Không đọc được ảnh đã chọn. Vui lòng chọn lại ảnh.");
          return response.blob();
        });
        if (!imageFile) throw new Error("Không đọc được ảnh đã chọn. Vui lòng chọn lại ảnh.");
        formData.append("image", imageFile, fileName);
      } else {
        formData.append("image", {
          uri: imageUri,
          name: fileName,
          type: mimeType
        } as any);
      }

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
      <ImageBackground source={photos.detail} resizeMode="cover" imageStyle={{ borderRadius: 22 }} style={{ minHeight: 195, borderRadius: 22, overflow: "hidden", justifyContent: "flex-end" }}>
        <View style={{ padding: 19, paddingTop: 75, backgroundColor: colors.photoOverlay }}>
          <Text style={[styles.muted, { color: colors.cream, fontSize: 11, letterSpacing: 2, fontWeight: "700" }]}>THE STYLE STUDIO</Text>
          <Text style={[styles.title, { color: colors.cream, fontSize: 30 }]}>AI Tư vấn kiểu tóc</Text>
        </View>
      </ImageBackground>
      <Text style={styles.muted}>
        Chỉ cần chụp hoặc tải ảnh khuôn mặt trực diện rõ nét. AI Vision sẽ tự nhìn tỷ lệ khuôn mặt và mái tóc hiện tại để gợi ý 3 kiểu tóc phù hợp nhất.
      </Text>
      <Text style={[styles.muted, { color: aiStatus?.aiMode === "live" ? colors.success : colors.danger }]}>
        {aiStatus?.aiMode === "live"
          ? `Đang dùng AI thật: ${aiStatus.aiProvider || "nhà cung cấp chưa rõ"}.`
          : aiStatus?.aiMode === "mock"
            ? "Backend đang ở chế độ mô phỏng: không đọc ảnh và không thể tư vấn thật."
            : "Chưa kết nối được backend AI."}
      </Text>
      <Card>
        <Text style={styles.subtitle}>Chính sách riêng tư</Text>
        <Text style={styles.muted}>Ảnh khuôn mặt được gửi tới dịch vụ phân tích để tạo gợi ý, chỉ xử lý trong phiên yêu cầu và không lưu vào hồ sơ salon. Ảnh đánh giá không được chia sẻ vào bộ sưu tập của salon nếu bạn chưa đồng ý.</Text>
      </Card>

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
                backgroundColor: colors.dark,
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
                trackColor={{ true: colors.gold, false: colors.border }}
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
                backgroundColor: colors.dark,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: colors.border
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
                backgroundColor: result.mode === "live" ? colors.statusCompleted : colors.statusPending,
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 6
              }}
            >
              <Text style={{ color: colors.dark, fontSize: 12, fontWeight: "700" }}>
                {result.provider || (result.mode === "live" ? "AI trực tiếp" : "Mô phỏng")}
                {typeof result.durationMs === "number" ? ` · ${(result.durationMs / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} giây` : ` · ${result.mode.toUpperCase()}`}
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
                      <View style={{ backgroundColor: colors.dark, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                        <Text style={{ color: colors.gold, fontSize: 11, fontWeight: "600" }}>{rec.direction}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.text}>{rec.reason}</Text>
                  <Text style={styles.muted}>Độ dài: {rec.length}</Text>
                  <Text style={styles.muted}>Mức chăm sóc: {rec.maintenance}</Text>
                  {rec.feasibility && (
                    <Text style={[styles.text, { color: rec.feasibility.includes("Cần nuôi") ? colors.statusPending : colors.success, fontSize: 13 }]}>
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
                  <View style={{ backgroundColor: colors.dark, padding: 10, borderRadius: 8, marginTop: 4 }}>
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

