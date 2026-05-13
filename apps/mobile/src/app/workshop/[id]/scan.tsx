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

import { createDatabaseClient } from "@/database/client";
import { deviceConfig } from "@/database/schema/device-config.schema";
import { ScanOverlay } from "@/features/checkin/components/ScanOverlay";
import { useScan } from "@/features/checkin/hooks/use-scan";
import { offlineAuth } from "@/lib/api/client/offline-auth";

const SCAN_DEBOUNCE_MS = 2000;

function getWorkshopId(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default function ScanScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const workshopId = getWorkshopId(params.id);

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
        `&code=${encodeURIComponent(result.studentCode)}` +
        `&duplicate=${result.duplicate ? "1" : "0"}` +
        (result.originallyCheckedInAt
          ? `&originalAt=${encodeURIComponent(result.originallyCheckedInAt.toISOString())}`
          : "");
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
    return <View className="flex-1 bg-[#0B1020]" />;
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <SafeAreaView className="flex-1 bg-[#0B1020]">
        <View className="flex-1 justify-center gap-4 p-6">
          <Text className="text-xs font-bold tracking-widest text-[#7DD3FC]">
            QR SCANNER
          </Text>
          <Text className="text-2xl font-extrabold text-white">
            Cần quyền truy cập camera
          </Text>
          <Text className="text-base leading-6 text-white/75">
            Ứng dụng cần quyền camera để quét mã QR điểm danh.
          </Text>
          <View className="gap-3">
            {permission.canAskAgain ? (
              <Pressable
                onPress={requestPermission}
                className="items-center justify-center rounded-2xl bg-primary py-3.5 active:opacity-85"
              >
                <Text className="text-base font-bold text-white">
                  Cấp quyền camera
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => Linking.openSettings()}
                className="items-center justify-center rounded-2xl bg-primary py-3.5 active:opacity-85"
              >
                <Text className="text-base font-bold text-white">
                  Mở cài đặt thiết bị
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => router.back()}
              className="items-center rounded-2xl border border-white/30 py-3.5 active:opacity-85"
            >
              <Text className="text-base font-bold text-white">Quay lại</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={StyleSheet.absoluteFillObject}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        onBarcodeScanned={isProcessing ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
      />

      <ScanOverlay
        isProcessing={isProcessing}
        errorMessage={errorMessage}
        tintColor="#3B82F6"
        onRetry={() => {
          reset();
          setIsProcessing(false);
          lastScannedAt.current = 0;
        }}
        onBack={() => router.back()}
      />
    </View>
  );
}
