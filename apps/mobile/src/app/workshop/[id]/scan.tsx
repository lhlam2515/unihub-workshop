import { router, useLocalSearchParams } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import ROUTES from "@/constants/routes";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

function getWorkshopId(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? "ws-demo";
  }

  return value ?? "ws-demo";
}

export default function ScanScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const workshopId = getWorkshopId(params.id);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: "#0B1020" }]}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>M04 · QR SCANNER</Text>
        <Text style={styles.title}>Quét vé cho {workshopId}</Text>
        <Text style={styles.subtitle}>
          Giao diện full-screen mô phỏng camera, giữ tập trung vào thao tác scan
          và trả kết quả nhanh về dashboard.
        </Text>

        <View style={styles.frameOuter}>
          <View style={[styles.frameInner, { borderColor: colors.tint }]}>
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
            <Text style={styles.frameLabel}>
              Đưa QR vào khung để mô phỏng kết quả quét
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={() => router.push(ROUTES.WORKSHOP_RESULT(workshopId))}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={styles.primaryButtonText}>Xem kết quả quét</Text>
          </Pressable>
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
            <Text style={styles.secondaryButtonText}>Quay lại dashboard</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 20,
    gap: 14,
    justifyContent: "center",
  },
  eyebrow: {
    color: "#7DD3FC",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  title: {
    color: "white",
    fontSize: 30,
    fontWeight: "800",
    lineHeight: 36,
  },
  subtitle: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 15,
    lineHeight: 22,
  },
  frameOuter: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  frameInner: {
    width: "100%",
    aspectRatio: 0.82,
    borderWidth: 2,
    borderRadius: 32,
    backgroundColor: "rgba(15,23,42,0.85)",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  frameLabel: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 22,
  },
  corner: {
    position: "absolute",
    width: 56,
    height: 56,
  },
  cornerTopLeft: {
    top: 18,
    left: 18,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 20,
  },
  cornerTopRight: {
    top: 18,
    right: 18,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 20,
  },
  cornerBottomLeft: {
    bottom: 18,
    left: 18,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 20,
  },
  cornerBottomRight: {
    bottom: 18,
    right: 18,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 20,
  },
  actions: {
    gap: 12,
  },
  primaryButton: {
    alignItems: "center",
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: "white",
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryButton: {
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  secondaryButtonText: {
    color: "white",
    fontSize: 15,
    fontWeight: "700",
  },
});
