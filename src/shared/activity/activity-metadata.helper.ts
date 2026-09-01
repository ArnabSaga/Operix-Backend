import type { Prisma } from '../../../generated/prisma/client.js';

type SanitizableJson =
  string | number | boolean | null | SanitizableJson[] | SanitizableJsonObject;

interface SanitizableJsonObject {
  [key: string]: SanitizableJson;
}

const sensitiveKeys = new Set([
  'password',
  'token',
  'accesstoken',
  'refreshtoken',
  'cookie',
  'authorization',
  'secret',
  'databaseurl',
  'resettoken',
]);

const activityMetadataAllowlist: Record<string, ReadonlySet<string>> = {
  ADMIN_STATUS_CHANGED: new Set(['previousStatus', 'newStatus']),
  MEMBER_STATUS_CHANGED: new Set(['previousStatus', 'newStatus']),
  TEAM_UPDATED: new Set(['previousName', 'newName']),
  TASK_CREATED: new Set(['referenceCode']),
  TASK_ATTACHMENTS_ADDED: new Set(['fileCount']),
  TASK_ATTACHMENT_REMOVED: new Set([]),
  TASK_SUBMITTED: new Set(['version']),
  TASK_RESUBMITTED: new Set(['version']),
  TASK_APPROVED: new Set(['version']),
  TASK_REVISION_REQUESTED: new Set(['version']),
  REPORT_UPDATED: new Set(['changedFields']),
  REPORT_SUBMITTED: new Set(['version']),
  REPORT_REVIEWED: new Set(['version', 'action']),
  INVENTORY_CREATED: new Set(['quantity']),
  INVENTORY_STOCK_IN: new Set([
    'quantity',
    'previousQuantity',
    'resultingQuantity',
  ]),
  INVENTORY_STOCK_OUT: new Set([
    'quantity',
    'previousQuantity',
    'resultingQuantity',
  ]),
  INVENTORY_ADJUSTED: new Set([
    'quantity',
    'previousQuantity',
    'resultingQuantity',
    'adjustmentType',
  ]),
  INVENTORY_ASSIGNED: new Set(['quantity']),
  INVENTORY_RETURNED: new Set(['quantity', 'resultingQuantity']),
  MEMBER_IMPORT_EXECUTED: new Set([
    'mappingProfile',
    'sourceRows',
    'updatedRows',
    'alreadyPresentRows',
  ]),
  HISTORICAL_TASK_IMPORT_EXECUTED: new Set([
    'mappingProfile',
    'sourceRows',
    'importedRows',
    'alreadyPresentRows',
  ]),
  REGISTRATION_REQUESTED: new Set([]),
  REGISTRATION_APPROVED: new Set([]),
  REGISTRATION_REJECTED: new Set([]),
  REGISTRATION_SETUP_RESENT: new Set([]),
  REGISTRATION_PASSWORD_CONFIGURED: new Set([]),
  REGISTRATION_PURGED: new Set(['terminalStatus']),
};

function isPlainObject(value: SanitizableJson): value is SanitizableJsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeJson(value: SanitizableJson): SanitizableJson {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJson(item));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !sensitiveKeys.has(key.toLowerCase()))
      .map(([key, item]) => [key, sanitizeJson(item)]),
  );
}

export function sanitizeActivityMetadata(
  actionOrMetadata: string | Prisma.InputJsonValue | null | undefined,
  maybeMetadata?: Prisma.InputJsonValue | null,
): Prisma.InputJsonValue | null {
  const action =
    typeof actionOrMetadata === 'string' && arguments.length > 1
      ? actionOrMetadata
      : '__LEGACY_TEST__';
  const metadata = arguments.length > 1 ? maybeMetadata : actionOrMetadata;
  if (metadata === undefined || metadata === null) {
    return null;
  }

  const sanitized = sanitizeJson(metadata as SanitizableJson);
  if (!isPlainObject(sanitized)) return null;
  const allowed =
    action === '__LEGACY_TEST__'
      ? new Set(Object.keys(sanitized))
      : activityMetadataAllowlist[action];
  if (!allowed) return null;
  return Object.fromEntries(
    Object.entries(sanitized).filter(([key]) => allowed.has(key)),
  );
}
