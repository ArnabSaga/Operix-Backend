import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { PrismaModule } from '../../database/prisma.module.js';
import { PrismaService } from '../../database/prisma.service.js';
import { OperixAuthController } from './auth.controller.js';
import { createOperixAuth } from './auth.factory.js';
import { OperixAuthService } from './auth.service.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule.forRootAsync({
      imports: [PrismaModule],
      inject: [PrismaService, ConfigService],
      useFactory: (prisma: PrismaService, config: ConfigService) => ({
        auth: createOperixAuth(prisma, config),
        bodyParser: {
          json: {
            limit: '2mb',
          },
          urlencoded: {
            extended: true,
            limit: '2mb',
          },
        },
      }),
    }),
  ],
  controllers: [OperixAuthController],
  providers: [OperixAuthService],
  exports: [OperixAuthService],
})
export class OperixAuthModule {}
