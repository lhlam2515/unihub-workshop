/**
 * Color bridge for React Native styles that mirrors the Tailwind tokens
 * defined in src/app/global.css and tailwind.config.js.
 */
import { Platform } from "react-native";

export const Colors = {
  light: {
    text: "#09090b",
    background: "#ffffff",
    tint: "#1447e6",
    icon: "#71717b",
    tabIconDefault: "#e4e4e7",
    tabIconSelected: "#1447e6",
  },
  dark: {
    text: "#fafafa",
    background: "#09090b",
    tint: "#193cb8",
    icon: "#9f9fa9",
    tabIconDefault: "#ffffff",
    tabIconSelected: "#193cb8",
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: "system-ui",
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: "ui-serif",
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: "ui-rounded",
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded:
      "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
