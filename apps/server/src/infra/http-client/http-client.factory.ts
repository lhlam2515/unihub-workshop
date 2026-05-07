import axios, { type AxiosInstance, type CreateAxiosDefaults } from "axios";

import { attachAuthInterceptor } from "./interceptors/auth.interceptor";
import { attachErrorInterceptor } from "./interceptors/error.interceptor";
import { attachLoggingInterceptor } from "./interceptors/logging.interceptor";

export interface AxiosFactoryOptions {
  baseURL: string;
  timeoutMs: number;
  apiKey?: string;
  authScheme?: "Bearer" | "Basic";
}

export function createAxiosInstance(
  options: AxiosFactoryOptions
): AxiosInstance {
  const config: CreateAxiosDefaults = {
    baseURL: options.baseURL,
    timeout: options.timeoutMs,
    headers: { "Content-Type": "application/json" },
  };

  const instance = axios.create(config);

  if (options.apiKey) {
    attachAuthInterceptor(
      instance,
      options.apiKey,
      options.authScheme ?? "Bearer"
    );
  }

  attachLoggingInterceptor(instance);
  attachErrorInterceptor(instance);

  return instance;
}
