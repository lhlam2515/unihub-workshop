import { AxiosError } from "axios";

import { HttpClientError, type HttpErrorKind } from "../http-client.error";

import type { AxiosInstance } from "axios";

export function attachErrorInterceptor(instance: AxiosInstance): void {
  instance.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => Promise.reject(normalizeAxiosError(error))
  );
}

function normalizeAxiosError(error: AxiosError): HttpClientError {
  if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
    return new HttpClientError(
      "TIMEOUT",
      error.message || "Request timed out",
      undefined,
      error
    );
  }

  if (error.response) {
    const status = error.response.status;
    const data = error.response.data;
    const message =
      typeof data === "object" && data !== null
        ? (((data as Record<string, unknown>).message as string) ??
          JSON.stringify(data))
        : data != null
          ? `${data as string | number | boolean}`
          : error.message;

    return new HttpClientError(
      classifyHttpStatus(status),
      message,
      status,
      error
    );
  }

  if (error.request) {
    return new HttpClientError(
      "NETWORK_ERROR",
      error.message || "No response received",
      undefined,
      error
    );
  }

  return new HttpClientError(
    "NETWORK_ERROR",
    error.message || "Unknown HTTP error",
    undefined,
    error
  );
}

function classifyHttpStatus(status: number): HttpErrorKind {
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "SERVER_ERROR";
  if (status >= 400) return "CLIENT_ERROR";
  return "SERVER_ERROR";
}
