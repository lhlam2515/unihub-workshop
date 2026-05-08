import type { AxiosInstance } from "axios";

export function attachAuthInterceptor(
  instance: AxiosInstance,
  apiKey: string,
  scheme: "Bearer" | "Basic" = "Bearer"
): void {
  if (scheme === "Bearer") {
    instance.defaults.headers.common["Authorization"] = `Bearer ${apiKey}`;
  }
}
