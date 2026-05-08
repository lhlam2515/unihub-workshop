import { eq } from "drizzle-orm";
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Colors } from "@/constants/theme";
import { createDatabaseClient } from "@/database/client";
import { deviceConfig } from "@/database/schema/device-config.schema";
import { useScan } from "@/features/checkin/hooks/use-scan";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { offlineAuth } from "@/lib/api/client/offline-auth";

const SCAN_DEBOUNCE_MS = 2000;

function getWorkshopId(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default function ScanScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const workshopId = getWorkshopId(params.id);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];

  const [permission, requestPermission] = useCameraPermissions();
  const { scan, status, result, errorMessage, reset } = useScan();
  const lastScannedAt = useRef<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);

  // Navigate to result screen when scan succeeds
  useEffect(() => {
    if (status === "success" && result) {
      const params =
        `?source=${result.source}` +
        `&name=${encodeURIComponent(result.studentName)}` +
        `&code=${encodeURIComponent(result.studentCode)}`;
      const resultPath = `/workshop/${workshopId}/result${params}`;
      router.replace(resultPath as Parameters<typeof router.replace>[0]);
      reset();
      setIsProcessing(false);
    }
  }, [status, result, workshopId, reset]);

  // Clear processing flag on error so staff can retry
  useEffect(() => {
    if (status === "error") {
      setIsProcessing(false);
    }
  }, [status]);

  const handleBarCodeScanned = useCallback(
    ({ data }: BarcodeScanningResult) => {
      const now = Date.now();
      // Debounce: ignore if same scan happened within 2s
      if (isProcessing || now - lastScannedAt.current < SCAN_DEBOUNCE_MS)
        return;

      lastScannedAt.current = now;
      setIsProcessing(true);

      const payload = offlineAuth.getTokenPayload();
      const staffId = payload?.sub ?? "unknown";
      const db = createDatabaseClient();
      const device = db
        .select()
        .from(deviceConfig)
        .where(eq(deviceConfig.id, 1))
        .get();
      const deviceId = device?.deviceId ?? "unknown";

      void scan(data, workshopId, deviceId, staffId);
    },
    [isProcessing, scan, workshopId]
  );

  // Permission not yet determined
  if (!permission) {
    return <View style={[styles.safeArea, { backgroundColor: "#0B1020" }]} />;
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: "#0B1020" }]}>
        <View style={styles.content}>
          <Text style={styles.eyebrow}>QR SCANNER</Text>
          <Text style={styles.title}>Cần quyền truy cập camera</Text>
          <Text style={styles.subtitle}>
            Ứng dụng cần quyền camera để quét mã QR điểm danh.
          </Text>
          <View style={styles.actions}>
            {permission.canAskAgain ? (
              <Pressable
                onPress={requestPermission}
                style={({ pressed }) => [
                  styles.primaryButton,
                  {
                    backgroundColor: colors.tint,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text style={styles.primaryButtonText}>Cấp quyền camera</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => Linking.openSettings()}
                style={({ pressed }) => [
                  styles.primaryButton,
                  {
                    backgroundColor: colors.tint,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  Mở cài đặt thiết bị
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [
                styles.secondaryButton,
                {
                  borderColor: "rgba(255,255,255,0.3)",
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text style={styles.secondaryButtonText}>Quay lại</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: "#0B1020" }]}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        onBarcodeScanned={isProcessing ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
      />

      {/* Overlay UI */}
      <View style={styles.overlay}>
        <View style={styles.topBar}>
          <Text style={styles.eyebrow}>QR SCANNER</Text>
          <Text style={styles.title}>Quét vé</Text>
        </View>

        <View style={styles.frameOuter}>
          <View
            style={[
              styles.corner,
              styles.cornerTopLeft,
              { borderColor: colors.tint },
            ]}
          />
          <View
            style={[
              styles.corner,
              styles.cornerTopRight,
              { borderColor: colors.tint },
            ]}
          />
          <View
            style={[
              styles.corner,
              styles.cornerBottomLeft,
              { borderColor: colors.tint },
            ]}
          />
          <View
            style={[
              styles.corner,
              styles.cornerBottomRight,
              { borderColor: colors.tint },
            ]}
          />
          {isProcessing && (
            <Text style={styles.processingText}>Đang xử lý...</Text>
          )}
        </View>

        <View style={styles.bottomBar}>
          {errorMessage ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMessage}</Text>
              <Pressable
                onPress={() => {
                  reset();
                  setIsProcessing(false);
                  lastScannedAt.current = 0;
                }}
              >
                <Text style={[styles.retryText, { color: colors.tint }]}>
                  Thử lại
                </Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.hint}>Đưa mã QR vào khung để điểm danh</Text>
          )}

          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.backButton,
              {
                borderColor: "rgba(255,255,255,0.3)",
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={styles.secondaryButtonText}>Quay lại dashboard</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: {
    flex: 1,
    padding: 24,
    gap: 16,
    justifyContent: "center",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
    padding: 24,
  },
  topBar: { gap: 8 },
  eyebrow: {
    color: "#7DD3FC",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  title: {
    color: "white",
    fontSize: 28,
    fontWeight: "800",
  },
  subtitle: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 15,
    lineHeight: 22,
  },
  frameOuter: {
    alignSelf: "center",
    width: 260,
    height: 260,
    alignItems: "center",
    justifyContent: "center",
  },
  corner: {
    position: "absolute",
    width: 48,
    height: 48,
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 16,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 16,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 16,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 16,
  },
  processingText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 14,
    fontWeight: "600",
  },
  bottomBar: { gap: 12 },
  hint: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 14,
    textAlign: "center",
  },
  errorBox: {
    backgroundColor: "rgba(239,68,68,0.15)",
    borderRadius: 12,
    padding: 12,
    gap: 8,
    alignItems: "center",
  },
  errorText: {
    color: "#FCA5A5",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  retryText: { fontSize: 13, fontWeight: "700" },
  actions: { gap: 12 },
  primaryButton: {
    alignItems: "center",
    borderRadius: 18,
    paddingVertical: 14,
  },
  primaryButtonText: { color: "white", fontSize: 15, fontWeight: "700" },
  backButton: {
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 14,
  },
  secondaryButton: {
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 14,
  },
  secondaryButtonText: { color: "white", fontSize: 15, fontWeight: "700" },
});
