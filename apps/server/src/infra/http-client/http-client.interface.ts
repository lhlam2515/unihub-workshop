import type { Result } from "@/shared/response/result";

export interface RequestOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export interface HttpResponse<T> {
  data: T;
  status: number;
  headers: Record<string, string>;
}

export interface IHttpClient {
  get<T>(
    url: string,
    options?: RequestOptions
  ): Promise<Result<HttpResponse<T>>>;
  post<T>(
    url: string,
    body: unknown,
    options?: RequestOptions
  ): Promise<Result<HttpResponse<T>>>;
  put<T>(
    url: string,
    body: unknown,
    options?: RequestOptions
  ): Promise<Result<HttpResponse<T>>>;
  delete<T>(
    url: string,
    options?: RequestOptions
  ): Promise<Result<HttpResponse<T>>>;
}
