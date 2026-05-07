import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { Result } from "@/shared/response/result";

import {
  HttpClientError,
  httpClientErrorToAppError,
} from "./http-client.error";
import { createAxiosInstance } from "./http-client.factory";

import type {
  IHttpClient,
  HttpResponse,
  RequestOptions,
} from "./http-client.interface";
import type { AxiosInstance } from "axios";

const GATEWAY_TIMEOUT_MS = 5_000;

@Injectable()
export class GatewayHttpClient implements IHttpClient {
  private readonly logger = new Logger(GatewayHttpClient.name);
  private readonly axios: AxiosInstance;

  constructor(configService: ConfigService) {
    const baseURL = configService.getOrThrow<string>("gateway.baseUrl");
    const apiKey = configService.get<string>("gateway.apiKey");

    this.axios = createAxiosInstance({
      baseURL,
      timeoutMs: GATEWAY_TIMEOUT_MS,
      apiKey,
      authScheme: "Bearer",
    });

    this.logger.log(`GatewayHttpClient initialized for ${baseURL}`);
  }

  async post<T>(
    url: string,
    body: unknown,
    options?: RequestOptions
  ): Promise<Result<HttpResponse<T>>> {
    try {
      const response = await this.axios.post<T>(url, body, {
        headers: options?.headers,
        timeout: options?.timeoutMs ?? GATEWAY_TIMEOUT_MS,
      });
      return Result.ok({
        data: response.data,
        status: response.status,
        headers: response.headers as Record<string, string>,
      });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async get<T>(
    url: string,
    options?: RequestOptions
  ): Promise<Result<HttpResponse<T>>> {
    try {
      const response = await this.axios.get<T>(url, {
        headers: options?.headers,
        timeout: options?.timeoutMs ?? GATEWAY_TIMEOUT_MS,
      });
      return Result.ok({
        data: response.data,
        status: response.status,
        headers: response.headers as Record<string, string>,
      });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async put<T>(
    url: string,
    body: unknown,
    options?: RequestOptions
  ): Promise<Result<HttpResponse<T>>> {
    try {
      const response = await this.axios.put<T>(url, body, {
        headers: options?.headers,
        timeout: options?.timeoutMs ?? GATEWAY_TIMEOUT_MS,
      });
      return Result.ok({
        data: response.data,
        status: response.status,
        headers: response.headers as Record<string, string>,
      });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async delete<T>(
    url: string,
    options?: RequestOptions
  ): Promise<Result<HttpResponse<T>>> {
    try {
      const response = await this.axios.delete<T>(url, {
        headers: options?.headers,
        timeout: options?.timeoutMs ?? GATEWAY_TIMEOUT_MS,
      });
      return Result.ok({
        data: response.data,
        status: response.status,
        headers: response.headers as Record<string, string>,
      });
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError<T>(error: unknown): Result<HttpResponse<T>> {
    const httpError =
      error instanceof HttpClientError
        ? error
        : new HttpClientError("NETWORK_ERROR", String(error), undefined, error);
    return Result.fail(httpClientErrorToAppError(httpError));
  }
}
