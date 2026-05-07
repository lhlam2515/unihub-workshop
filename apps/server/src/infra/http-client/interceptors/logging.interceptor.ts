import { Logger } from "@nestjs/common";
import {
  AxiosError,
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";

export function attachLoggingInterceptor(instance: AxiosInstance): void {
  const logger = new Logger("HttpClient");

  instance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    logger.log(
      `${config.method?.toUpperCase()} ${config.baseURL}${config.url ?? ""}`
    );
    return config;
  });

  instance.interceptors.response.use(
    (response: AxiosResponse) => {
      logger.log(
        `${response.status} ${response.config.method?.toUpperCase()} ${response.config.url ?? ""}`
      );
      return response;
    },
    (rawError: unknown) => {
      if (rawError instanceof AxiosError) {
        if (rawError.response) {
          logger.warn(
            `${rawError.response.status} ${rawError.config?.method?.toUpperCase()} ${rawError.config?.url ?? ""}`
          );
        } else if (rawError.request) {
          logger.error(
            `No response: ${rawError.config?.method?.toUpperCase()} ${rawError.config?.url ?? ""} -- ${rawError.message}`
          );
        }
      }
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      return Promise.reject(rawError);
    }
  );
}
