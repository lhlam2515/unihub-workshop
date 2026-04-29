const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Allow importing .sql migration files (drizzle-orm)
config.resolver.sourceExts.push("sql");

module.exports = withNativeWind(config, {
  input: "./global.css",
  inlineRem: 16,
});
