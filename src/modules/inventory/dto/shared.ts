export function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export function optionalTrimString(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  return trimString(value);
}

export function toOptionalBoolean(value: unknown): unknown {
  if (value === undefined || value === null || typeof value === 'boolean') {
    return value;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return value;
}
