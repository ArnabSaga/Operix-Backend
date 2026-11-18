import { Injectable } from '@nestjs/common';
import type { OperixRequest } from '../auth/operix-request.interface.js';
import { OperixThrottlerGuard } from './operix-throttler.guard.js';

/**
 * Per-authenticated-user throttling for expensive endpoints.
 *
 * The global `OperixThrottlerGuard` keys its buckets by client address, which
 * lets several users behind one NAT share a single budget. Endpoints that cost
 * real provider quota (AI generation, for example) must be limited per user,
 * so this guard reuses the same error contract while changing only the key.
 *
 * It must run after `ViewerContextGuard` so that `operixViewer` is available.
 */
@Injectable()
export class OperixUserThrottlerGuard extends OperixThrottlerGuard {
  protected override async getTracker(
    req: Record<string, unknown>,
  ): Promise<string> {
    const viewer = (req as unknown as OperixRequest).operixViewer;

    if (viewer?.userId) {
      return `user:${viewer.userId}`;
    }

    return super.getTracker(req);
  }
}
