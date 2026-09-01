import type { Request } from 'express';

export function getTrustedClientIp(request: Request): string {
  if (process.env.VERCEL === '1') {
    const forwarded = request.header('x-vercel-forwarded-for');
    const candidate = forwarded?.split(',')[0]?.trim();
    if (candidate) return candidate;
  }

  return request.ip ?? request.socket.remoteAddress ?? 'unresolved';
}
