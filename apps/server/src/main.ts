/**
 * Application entry point.
 *
 * TLS/HTTPS termination is handled by the reverse proxy (Nginx / Cloudflare).
 * The server itself runs HTTP internally, which is standard practice for
 * containerized deployments behind a load balancer. Do NOT add
 * https.createServer() here — TLS certificates are managed at the proxy layer.
 *
 * Security middleware:
 * - helmet() sets secure HTTP headers (HSTS, CSP, X-Frame-Options, etc.).
 * - CORS is configured via getCorsConfig().
 * - cookieParser() enables HttpOnly cookie-based refresh token flow.
 * - morgan logs HTTP traffic to Winston for structured observability.
 */
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import morgan from "morgan";

import { getCorsConfig } from "@/core/config/cors.config";
import { winstonLogger } from "@/core/config/logger.config";

import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: winstonLogger,
    rawBody: true,
  });

  const configService = app.get(ConfigService);
  const frontendUrl = configService.get<string>("cors.frontendUrl");

  app.setGlobalPrefix("api/v1");
  app.use(helmet());
  app.enableCors(getCorsConfig(frontendUrl));
  app.use(cookieParser());
  app.use(
    morgan(
      ':remote-addr - :remote-user ":method :url HTTP/:http-version" :status :response-time ms ":user-agent"',
      {
        stream: {
          write: (message: string) => {
            winstonLogger.log(message.trim(), "HTTP");
          },
        },
      }
    )
  );

  const port = configService.get<number>("app.port") ?? 8000;
  await app.listen(port);

  winstonLogger.log(
    `Server is listening on http://localhost:${port}/api/v1`,
    "Bootstrap"
  );
}
void bootstrap();
