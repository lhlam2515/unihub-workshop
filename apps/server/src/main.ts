import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { ZodValidationPipe } from 'nestjs-zod';

import { getCorsConfig } from '@/core/config/cors.config';
import { winstonLogger } from '@/core/config/logger.config';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: winstonLogger,
  });

  app.use(helmet());
  app.use(cookieParser());

  app.enableCors(getCorsConfig());

  app.useGlobalPipes(new ZodValidationPipe());

  const port = process.env.PORT || 3000;
  await app.listen(port);

  winstonLogger.log(`Server is running on port ${port}`, 'Bootstrap');
}
bootstrap();
