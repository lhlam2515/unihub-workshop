import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface ScanOverlayProps {
  isProcessing: boolean;
  errorMessage: string | null;
  tintColor: string;
  onRetry: () => void;
  onBack: () => void;
}

export function ScanOverlay({
  isProcessing,
  errorMessage,
  tintColor,
  onRetry,
  onBack,
}: ScanOverlayProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.overlay, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.topBar}>
        <Text style={styles.eyebrow}>QR SCANNER</Text>
        <Text style={styles.title}>Quét vé</Text>
      </View>

      <View style={styles.frameOuter}>
        <View
          style={[
            styles.corner,
            styles.cornerTopLeft,
            { borderColor: tintColor },
          ]}
        />
        <View
          style={[
            styles.corner,
            styles.cornerTopRight,
            { borderColor: tintColor },
          ]}
        />
        <View
          style={[
            styles.corner,
            styles.cornerBottomLeft,
            { borderColor: tintColor },
          ]}
        />
        <View
          style={[
            styles.corner,
            styles.cornerBottomRight,
            { borderColor: tintColor },
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
            <Pressable onPress={onRetry}>
              <Text style={[styles.retryText, { color: tintColor }]}>
                Thử lại
              </Text>
            </Pressable>
          </View>
        ) : (
          <Text style={styles.hint}>Đưa mã QR vào khung để điểm danh</Text>
        )}

        <Pressable
          onPress={onBack}
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
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
    paddingHorizontal: 24,
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
  backButton: {
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 14,
  },
  secondaryButtonText: { color: "white", fontSize: 15, fontWeight: "700" },
});
