import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import { PrismaClient } from '../../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(configService: ConfigService) {
    const pool = new Pool({
      connectionString: configService.getOrThrow<string>('database.url'),
    });

    const adapter = new PrismaPg(pool);

    super({
      adapter,
    });

    this.pool = pool;
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    await this.pool.end();
  }
}
