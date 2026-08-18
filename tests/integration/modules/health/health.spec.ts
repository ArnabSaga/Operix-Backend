import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApplication } from '../../../support/server/create-test-application';

describe('Health endpoint', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3000';
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@127.0.0.1:1/operix_unavailable';
    process.env.FRONTEND_URL = 'http://localhost:3001';
    process.env.SWAGGER_ENABLED = 'false';
    app = await createTestApplication();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns liveness while PostgreSQL is unavailable', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server).get('/api/v1/health');
    const body = response.body as unknown as {
      status: string;
      service: string;
      timestamp: string;
    };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: 'ok',
      service: 'operix-backend',
    });
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it('returns the shared error envelope for an unknown route', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server).get('/api/v1/missing');
    const body = response.body as unknown;

    expect(response.status).toBe(404);
    expect(body).toEqual({
      success: false,
      message: 'Cannot GET /api/v1/missing',
      code: 'RESOURCE_NOT_FOUND',
      details: null,
    });
  });
});
