import { Readable } from 'node:stream';
import {
  readStreamToBufferWithLimit,
  StreamLimitExceededError,
} from '../../../../src/shared/file-storage/stream-buffer.helper';

describe('readStreamToBufferWithLimit', () => {
  it('concatenates buffer chunks in order', async () => {
    const result = await readStreamToBufferWithLimit(
      Readable.from([
        Buffer.from('operix'),
        Buffer.from('-'),
        Buffer.from('ai'),
      ]),
      32,
    );

    expect(result.toString('utf8')).toBe('operix-ai');
  });

  it('accepts string and Uint8Array chunks', async () => {
    const result = await readStreamToBufferWithLimit(
      Readable.from(['ab', new Uint8Array([0x63, 0x64])]),
      16,
    );

    expect(result.toString('utf8')).toBe('abcd');
  });

  it('accepts a stream whose size exactly equals the cap', async () => {
    const result = await readStreamToBufferWithLimit(
      Readable.from([Buffer.alloc(4), Buffer.alloc(4)]),
      8,
    );

    expect(result).toHaveLength(8);
  });

  it('stops at the first chunk that crosses the cap and destroys the stream', async () => {
    let producedChunks = 0;
    const source = Readable.from(
      (function* generate() {
        while (true) {
          producedChunks += 1;
          yield Buffer.alloc(4, 0x61);
        }
      })(),
    );

    const error: unknown = await readStreamToBufferWithLimit(source, 5).then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(StreamLimitExceededError);
    expect((error as StreamLimitExceededError).maxBytes).toBe(5);
    // `Readable.from` keeps at most one chunk of look-ahead, so crossing on
    // the second chunk stops well before the unbounded generator is drained.
    expect(producedChunks).toBeLessThanOrEqual(3);
    expect(source.destroyed).toBe(true);
  });

  it('does not wrap errors raised by the source stream', async () => {
    const failure = new Error('storage connection reset');
    const source = new Readable({
      read() {
        this.destroy(failure);
      },
    });

    const error: unknown = await readStreamToBufferWithLimit(
      source,
      1_024,
    ).then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(error).toBe(failure);
  });

  it('returns an empty buffer for an empty stream', async () => {
    const result = await readStreamToBufferWithLimit(Readable.from([]), 8);

    expect(result).toHaveLength(0);
  });
});
