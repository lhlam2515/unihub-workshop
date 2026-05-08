import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { PortalHost } from "@rn-primitives/portal";
import { eq } from "drizzle-orm";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import "react-native-reanimated";

import { createDatabaseClient } from "@/database/client";
import { DatabaseProvider } from "@/database/provider";
import { deviceConfig } from "@/database/schema/device-config.schema";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { tokenStore } from "@/lib/api/client";
import "./global.css";

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [isReady, setIsReady] = useState(false);
  const [databaseStatus, setDatabaseStatus] = useState<
    "bootstrapping" | "migrations" | "ready" | "error"
  >("bootstrapping");

  useEffect(() => {
    async function bootstrap() {
      // Hydrate memory cache from SecureStore before any API call
      await tokenStore.init();

      // Ensure device_config singleton exists (one-time device ID generation)
      try {
        const db = createDatabaseClient();
        const existing = db
          .select()
          .from(deviceConfig)
          .where(eq(deviceConfig.id, 1))
          .get();
        if (!existing) {
          db.insert(deviceConfig).values({
            id: 1,
            deviceId: crypto.randomUUID(),
            appVersion: "0.0.0",
            initializedAt: Date.now(),
          });
        }
      } catch {
        // Non-critical: device_config is a nice-to-have for tracking
      }
      setIsReady(true);
    }
    bootstrap();
  }, []);

  const content = isReady ? (
    <Stack initialRouteName="index" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="workshop" />
      <Stack.Screen name="sync" options={{ presentation: "modal" }} />
    </Stack>
  ) : null;

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <DatabaseProvider onStatusChange={setDatabaseStatus}>
        {content}
      </DatabaseProvider>
      {!isReady ||
      databaseStatus === "bootstrapping" ||
      databaseStatus === "migrations" ? (
        <BootstrapScreen />
      ) : null}
      <StatusBar style="auto" />
      <PortalHost />
    </ThemeProvider>
  );
}

function BootstrapScreen() {
  return (
    <View style={styles.bootstrapScreen}>
      <Text style={styles.bootstrapText}>Đang khởi tạo ứng dụng...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bootstrapScreen: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  bootstrapText: {
    color: "#888",
    fontSize: 14,
  },
});
