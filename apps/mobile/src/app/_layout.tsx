import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { PortalHost } from "@rn-primitives/portal";
import { and, eq, inArray, lt } from "drizzle-orm";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import * as ExpoCrypto from "expo-crypto";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import "react-native-reanimated";
import { vars } from "nativewind";

import { createDatabaseClient } from "@/database/client";
import { DatabaseProvider } from "@/database/provider";
import { deviceConfig } from "@/database/schema/device-config.schema";
import { checkinQueue } from "@/database/schema/checkin-queue.schema";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { tokenStore } from "@/lib/api/client";
import "./global.css";

const lightVars = vars({
  "--background": "0 0% 100%",
  "--foreground": "240 11% 4%",
  "--card": "0 0% 100%",
  "--card-foreground": "240 11% 4%",
  "--popover": "0 0% 100%",
  "--popover-foreground": "240 11% 4%",
  "--primary": "225 84% 49%",
  "--primary-foreground": "214 96% 97%",
  "--secondary": "240 4% 96%",
  "--secondary-foreground": "240 6% 10%",
  "--muted": "240 4% 96%",
  "--muted-foreground": "240 4% 46%",
  "--accent": "240 4% 96%",
  "--accent-foreground": "240 6% 10%",
  "--destructive": "357 100% 45%",
  "--destructive-foreground": "214 96% 97%",
  "--border": "240 6% 90%",
  "--input": "240 6% 90%",
  "--ring": "240 6% 64%",
});

const darkVars = vars({
  "--background": "240 11% 4%",
  "--foreground": "180 0% 98%",
  "--card": "240 6% 18%",
  "--card-foreground": "180 0% 98%",
  "--popover": "240 6% 18%",
  "--popover-foreground": "180 0% 98%",
  "--primary": "227 76% 41%",
  "--primary-foreground": "214 96% 97%",
  "--secondary": "240 4% 50%",
  "--secondary-foreground": "180 0% 98%",
  "--muted": "240 4% 50%",
  "--muted-foreground": "240 6% 64%",
  "--accent": "240 4% 50%",
  "--accent-foreground": "180 0% 98%",
  "--destructive": "359 100% 70%",
  "--destructive-foreground": "214 96% 97%",
  "--border": "240 4% 22%",
  "--input": "240 4% 22%",
  "--ring": "240 4% 46%",
});

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
            deviceId: ExpoCrypto.randomUUID(),
            appVersion: "0.0.0",
            initializedAt: Date.now(),
          });
        }

        // Purge SYNCED checkin records older than 7 days
        const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
        db.delete(checkinQueue)
          .where(
            and(
              inArray(checkinQueue.syncStatus, ["SYNCED"]),
              lt(checkinQueue.createdAt, cutoff)
            )
          )
          .run();
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

  const themeVars = colorScheme === "dark" ? darkVars : lightVars;

  return (
    <View style={[{ flex: 1 }, themeVars]}>
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
    </View>
  );
}

function BootstrapScreen() {
  return (
    <View className="absolute inset-0 items-center justify-center bg-background">
      <Text className="text-sm text-muted-foreground">
        Đang khởi tạo ứng dụng...
      </Text>
    </View>
  );
}
