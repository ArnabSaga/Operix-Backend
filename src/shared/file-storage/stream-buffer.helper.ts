import type { Readable } from 'node:stream';

/**
 * Raised when a storage stream produces more bytes than the caller allows.
 *
 * The helper lives in shared infrastructure and therefore does not know about
 * HTTP status codes. Callers map this error to their own contract.
 */
export class StreamLimitExceededError extends Error {
  constructor(readonly maxBytes: number) {
    super('The stored file exceeded the maximum allowed size.');
    this.name = 'StreamLimitExceededError';
  }
}

/**
 * Buffers a storage stream while enforcing an actual bytes-read cap.
 *
 * `FileAsset.sizeBytes` is metadata written at upload time. It is useful for a
 * cheap early rejection, but it is never trusted as the real size: this helper
 * counts the bytes that actually arrive and aborts as soon as the cap is
 * crossed, so a mismatched record cannot exhaust memory.
 */
export async function readStreamToBufferWithLimit(
  stream: Readable,
  maxBytes: number,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of stream) {
    const buffer = toBuffer(chunk);
    totalBytes += buffer.byteLength;

    if (totalBytes > maxBytes) {
      stream.destroy();
      throw new StreamLimitExceededError(maxBytes);
    }

    chunks.push(buffer);
  }

  return Buffer.concat(chunks, totalBytes);
}

function toBuffer(chunk: unknown): Buffer {
  if (Buffer.isBuffer(chunk)) {
    return chunk;
  }

  if (typeof chunk === 'string') {
    return Buffer.from(chunk, 'utf8');
  }

  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk);
  }

  return Buffer.from(String(chunk), 'utf8');
}
