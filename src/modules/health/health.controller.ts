import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';
import type { HealthResponse } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOkResponse({ description: 'The application is running.' })
  getHealth(): HealthResponse {
    return this.healthService.getHealth();
  }
}
