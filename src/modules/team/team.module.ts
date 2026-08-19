import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { TeamController } from './team.controller.js';
import { TeamService } from './team.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [TeamController],
  providers: [TeamService],
  exports: [TeamService],
})
export class TeamModule {}
