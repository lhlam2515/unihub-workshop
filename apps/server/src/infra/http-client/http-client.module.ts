import { Module } from "@nestjs/common";

import { AIProviderHttpClient } from "./ai-provider-client";
import { GatewayHttpClient } from "./gateway-client";
import {
  AI_PROVIDER_HTTP_CLIENT,
  GATEWAY_HTTP_CLIENT,
} from "./http-client.constants";

@Module({
  providers: [
    {
      provide: GATEWAY_HTTP_CLIENT,
      useClass: GatewayHttpClient,
    },
    {
      provide: AI_PROVIDER_HTTP_CLIENT,
      useClass: AIProviderHttpClient,
    },
  ],
  exports: [GATEWAY_HTTP_CLIENT, AI_PROVIDER_HTTP_CLIENT],
})
export class HttpClientModule {}
