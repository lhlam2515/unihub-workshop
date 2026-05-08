import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ["pino", "pino-pretty"],
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
