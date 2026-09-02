export function trimString(value: unknown): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }
  return value;
}

export function optionalTrimString(value: unknown): unknown {
  if (value === null || value === undefined) {
    return undefined;
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
