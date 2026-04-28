import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import morgan from 'morgan';

import { getCorsConfig } from '@/core/config/cors.config';
import { winstonLogger } from '@/core/config/logger.config';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: winstonLogger,
  });

  app.use(helmet());
  app.enableCors(getCorsConfig());
  app.use(cookieParser());
  app.use(
    morgan(
      ':remote-addr - :remote-user ":method :url HTTP/:http-version" :status :response-time ms ":user-agent"',
      {
        stream: {
          write: (message: string) => {
            winstonLogger.log(message.trim(), 'HTTP');
          },
        },
      }
    )
  );

  const port = process.env.PORT || 3000;
  await app.listen(port);

  winstonLogger.log(
    `Server is listening on http://localhost:${port}`,
    'Bootstrap'
  );
}
bootstrap();
