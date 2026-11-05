import React, { useState } from "react";
import { View, Text, Image, Pressable, Switch, Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { api } from "./api";
import { ConsultationResult, Preferences } from "./types";
import {
  Button,
  Card,
  ErrorText,
  Field,
  Loading,
  Page,
  styles,
  colors
} from "./ui";

interface ConsultationProps {
  onBookWithHaircut?: (haircutName: string, barberNote: string) => void;
}

export function Consultation({ onBookWithHaircut }: ConsultationProps = {}) {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [consent, setConsent] = useState<boolean>(true);

  // Preferences form
  const [hairLength, setHairLength] = useState("Trung bình");
  const [desiredLength, setDesiredLength] = useState("Ngắn gọn hoặc tỉa layer");
  const [hairTexture, setHairTexture] = useState("Tóc thẳng tự nhiên");
  const [hairDensity, setHairDensity] = useState("Dày vừa phải");
  const [preferredStyle, setPreferredStyle] = useState("Trẻ trung, hiện đại");
  const [maintenanceLevel, setMaintenanceLevel] = useState<"low" | "medium" | "high">("medium");
  const [wantsDye, setWantsDye] = useState(false);
  const [wantsPerm, setWantsPerm] = useState(false);
  const [hairCondition, setHairCondition] = useState("Khỏe, chưa qua tẩy");

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

    const preferences: Preferences = {
      hairLength,
      desiredLength,
      hairTexture,
      hairDensity,
      preferredStyle,
      maintenanceLevel,
      wantsDye,
      wantsPerm,
      hairCondition
    };

    try {
      const formData = new FormData();
      formData.append("consent", "true");
      formData.append("preferences", JSON.stringify(preferences));

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
        Chụp ảnh khuôn mặt chính diện và điền sở thích để nhận gợi ý kiểu tóc phù hợp nhất.
      </Text>

      <ErrorText message={error} />

      {/* Image selector */}
      <Card>
        <Text style={styles.subtitle}>Ảnh khuôn mặt</Text>
        {imageUri ? (
          <View style={{ alignItems: "center", gap: 10, marginVertical: 8 }}>
            <Image
              source={{ uri: imageUri }}
              style={{ width: 180, height: 180, borderRadius: 16, backgroundColor: "#333" }}
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button title="Chụp lại" secondary onPress={takePhoto} />
              <Button title="Chọn ảnh khác" secondary onPress={pickImage} />
            </View>
          </View>
        ) : (
          <View style={{ gap: 10, marginVertical: 8 }}>
            <Button title="Chụp ảnh bằng Camera" onPress={takePhoto} />
            <Button title="Chọn từ thư viện ảnh" secondary onPress={pickImage} />
          </View>
        )}
      </Card>

      {/* Preferences Form */}
      <Card>
        <Text style={styles.subtitle}>Sở thích & Tình trạng tóc</Text>
        <Field label="Độ dài tóc hiện tại" value={hairLength} onChange={setHairLength} />
        <Field label="Độ dài mong muốn" value={desiredLength} onChange={setDesiredLength} />
        <Field label="Chất tóc (thẳng, xoăn nhẹ, rễ tre...)" value={hairTexture} onChange={setHairTexture} />
        <Field label="Mật độ tóc (dày, mỏng, vừa)" value={hairDensity} onChange={setHairDensity} />
        <Field label="Phong cách ưa thích (layer, side part...)" value={preferredStyle} onChange={setPreferredStyle} />
        <Field label="Tình trạng tóc (khỏe, đã tẩy, khô xơ...)" value={hairCondition} onChange={setHairCondition} />

        {/* Maintenance Level */}
        <View style={{ gap: 6 }}>
          <Text style={styles.muted}>Mức độ chăm sóc tóc</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["low", "medium", "high"] as const).map((level) => {
              const label = level === "low" ? "Thấp" : level === "medium" ? "Vừa" : "Cao";
              const isSelected = maintenanceLevel === level;
              return (
                <Pressable
                  key={level}
                  onPress={() => setMaintenanceLevel(level)}
                  style={[
                    styles.button,
                    !isSelected && styles.buttonSecondary,
                    { flex: 1, paddingVertical: 10 }
                  ]}
                >
                  <Text style={[styles.buttonText, !isSelected && { color: colors.text }]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Wants Dye / Perm switches */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
          <Text style={styles.text}>Muốn tư vấn nhuộm tóc?</Text>
          <Switch value={wantsDye} onValueChange={setWantsDye} trackColor={{ true: colors.gold, false: "#444" }} />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={styles.text}>Muốn tư vấn uốn tóc?</Text>
          <Switch value={wantsPerm} onValueChange={setWantsPerm} trackColor={{ true: colors.gold, false: "#444" }} />
        </View>

        {/* Consent */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 }}>
          <Switch value={consent} onValueChange={setConsent} trackColor={{ true: colors.gold, false: "#444" }} />
          <Text style={[styles.muted, { flex: 1, fontSize: 13 }]}>
            Tôi đồng ý gửi ảnh khuôn mặt và thông tin để hệ thống AI phân tích và tư vấn kiểu tóc.
          </Text>
        </View>

        <View style={{ marginTop: 8 }}>
          <Button
            title={loading ? "Đang phân tích..." : "Gửi ảnh & Nhận tư vấn"}
            onPress={handleSubmit}
            disabled={loading || !imageUri || !consent}
          />
        </View>
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
                  <Text style={[styles.subtitle, { color: colors.gold }]}>
                    {idx + 1}. {rec.name}
                  </Text>
                  <Text style={styles.text}>{rec.reason}</Text>
                  <Text style={styles.muted}>Độ dài: {rec.length}</Text>
                  <Text style={styles.muted}>Chăm sóc: {rec.maintenance}</Text>
                  <View style={{ backgroundColor: "#262626", padding: 10, borderRadius: 8, marginTop: 4 }}>
                    <Text style={[styles.muted, { fontSize: 13, color: colors.gold }]}>
                      Lưu ý cho thợ: {rec.barberNote}
                    </Text>
                  </View>
                  {onBookWithHaircut && (
                    <View style={{ marginTop: 8 }}>
                      <Button
                        title={`✂️ Đặt lịch kiểu tóc "${rec.name}"`}
                        onPress={() => onBookWithHaircut(rec.name, rec.barberNote)}
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

