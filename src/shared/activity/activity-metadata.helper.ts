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
  metadata: Prisma.InputJsonValue | null | undefined,
): Prisma.InputJsonValue | null {
  if (metadata === undefined || metadata === null) {
    return null;
  }

  return sanitizeJson(metadata as SanitizableJson);
}
