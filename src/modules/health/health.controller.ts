import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { HealthService } from './health.service.js';
import type { HealthResponse } from './health.service.js';

@ApiTags('health')
@AllowAnonymous()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOkResponse({ description: 'The application is running.' })
  getHealth(): HealthResponse {
    return this.healthService.getHealth();
  }
}
