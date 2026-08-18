import { Injectable } from '@nestjs/common';

export interface HealthResponse {
  status: 'ok';
  service: 'operix-backend';
  timestamp: string;
}

@Injectable()
export class HealthService {
  getHealth(): HealthResponse {
    return {
      status: 'ok',
      service: 'operix-backend',
      timestamp: new Date().toISOString(),
    };
  }
}
