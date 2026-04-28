import { MaterialIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

import { HapticTab } from "@/components/haptic-tab";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
        headerShown: false,
        tabBarButton: HapticTab,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Sự kiện",
          tabBarIcon: ({ color }) => (
            <MaterialIcons size={24} name="event" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="queue"
        options={{
          title: "Hàng đợi",
          tabBarIcon: ({ color }) => (
            <MaterialIcons size={24} name="sync" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Hồ sơ",
          tabBarIcon: ({ color }) => (
            <MaterialIcons size={24} name="person" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
