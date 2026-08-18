import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { GlobalExceptionFilter } from './shared/filters/global-exception.filter.js';

export function configureApplication(app: NestExpressApplication): void {
  const config = app.get(ConfigService);
  const frontendOrigins = config.getOrThrow<string[]>('app.frontendOrigins');

  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.enableCors({
    origin: frontendOrigins,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());

  if (config.getOrThrow<boolean>('app.swaggerEnabled')) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Operix API')
      .setDescription('Operix pharmaceutical workload and operations API')
      .setVersion('1.0')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }
}
