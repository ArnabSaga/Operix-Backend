import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApplication } from './app.setup.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  configureApplication(app);
  app.enableShutdownHooks();

  const config = app.get(ConfigService);
  await app.listen(config.getOrThrow<number>('app.port'));
}

void bootstrap();
