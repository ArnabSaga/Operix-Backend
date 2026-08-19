import type { Request } from 'express';
import type { OperixViewer } from './viewer.interface.js';

export interface OperixRequest extends Request {
  user?: {
    id?: string;
  };
  operixViewer?: OperixViewer;
}
