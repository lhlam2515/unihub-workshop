import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/features/auth/hooks/use-auth";

export default function LoginScreen() {
  const { login, loginStatus, errorMessage } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const isLoading = loginStatus === "loading";

  async function handleLogin() {
    await login(email, password);
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerClassName="grow justify-center p-6 gap-6"
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-2.5">
            <Text className="text-xs font-bold uppercase tracking-widest text-primary">
              CHECKIN_STAFF
            </Text>
            <Text className="text-3xl font-extrabold text-foreground">
              Đăng nhập
            </Text>
            <Text className="text-base leading-6 text-muted-foreground">
              Dành cho nhân sự điểm danh. Đăng nhập để bắt đầu ca trực.
            </Text>
          </View>

          <View className="gap-4">
            <View className="gap-2">
              <Text className="text-sm font-semibold text-foreground">
                Email
              </Text>
              <TextInput
                className="rounded-xl border border-border bg-black/5 px-4 py-3.5 text-base text-foreground dark:bg-white/5"
                placeholder="staff@unihub.edu.vn"
                placeholderTextColor="#9CA3AF"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
                editable={!isLoading}
              />
            </View>

            <View className="gap-2">
              <Text className="text-sm font-semibold text-foreground">
                Mật khẩu
              </Text>
              <TextInput
                className="rounded-xl border border-border bg-black/5 px-4 py-3.5 text-base text-foreground dark:bg-white/5"
                placeholder="••••••••"
                placeholderTextColor="#9CA3AF"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                editable={!isLoading}
                onSubmitEditing={handleLogin}
                returnKeyType="done"
              />
            </View>

            {errorMessage ? (
              <View className="rounded-xl border border-red-500 bg-red-500/10 p-3">
                <Text className="text-sm leading-5 text-red-500">
                  {errorMessage}
                </Text>
              </View>
            ) : null}

            <Pressable
              onPress={handleLogin}
              disabled={isLoading}
              className="mt-1 min-h-[52px] items-center justify-center rounded-2xl bg-primary py-4 active:opacity-75 disabled:opacity-75"
            >
              {isLoading ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text className="text-base font-bold text-white">
                  Đăng nhập
                </Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
