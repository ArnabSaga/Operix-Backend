import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { OperixRequest } from './operix-request.interface.js';
import type { OperixViewer } from './viewer.interface.js';

export function getCurrentViewerFromContext(
  context: ExecutionContext,
): OperixViewer | undefined {
  const request = context.switchToHttp().getRequest<OperixRequest>();
  return request.operixViewer;
}

export const CurrentViewer = createParamDecorator(
  (_data: unknown, context: ExecutionContext): OperixViewer | undefined =>
    getCurrentViewerFromContext(context),
);
