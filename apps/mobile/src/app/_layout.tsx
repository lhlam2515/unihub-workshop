import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { PortalHost } from "@rn-primitives/portal";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import "react-native-reanimated";

import { DatabaseProvider } from "@/database/provider";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { tokenStore } from "@/lib/api/client";
import "./global.css";

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function bootstrap() {
      // Hydrate memory cache from SecureStore before any API call
      await tokenStore.init();
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
      <DatabaseProvider>{content}</DatabaseProvider>
      <StatusBar style="auto" />
      <PortalHost />
    </ThemeProvider>
  );
}
