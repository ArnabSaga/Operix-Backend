export function expectNoPrivateIdentifiers(
  value: unknown,
  privateIds: readonly string[],
): void {
  const serialized = JSON.stringify(value);

  for (const privateId of privateIds) {
    expect(serialized).not.toContain(privateId);
  }
}

export function expectPublicIdentifier(value: unknown, publicId: string): void {
  expect(JSON.stringify(value)).toContain(publicId);
}
