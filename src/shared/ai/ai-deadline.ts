/**
 * Bounded-work helper for AI requests that do non-model work first.
 *
 * Document and Submission analysis read storage, buffer bytes, and extract text
 * before the provider is called. Without a shared deadline that work could run
 * far past `AI_TIMEOUT_MS`, so the HTTP request had no upper bound at all. The
 * deadline now starts when the request starts and every bounded step races
 * against it.
 *
 * The race stops *waiting*; it cannot cancel a synchronous parser. Every
 * extraction path is already capped (10 MB per file, 60k characters, bounded
 * pages/sheets/slides), so the abandoned work is finite.
 */
export class AiRequestTimeoutError extends Error {
  constructor() {
    super('AI request deadline exceeded.');
    this.name = 'AiRequestTimeoutError';
  }
}

export async function runWithinAiDeadline<T>(
  work: Promise<T>,
  signal: AbortSignal,
  deadline: number,
): Promise<T> {
  // Observe the work immediately: an early deadline exit below would otherwise
  // leave a later rejection unhandled.
  const observed = Promise.resolve(work);
  observed.catch(() => undefined);

  const remainingMs = deadline - Date.now();

  if (signal.aborted || remainingMs <= 0) {
    throw new AiRequestTimeoutError();
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new AiRequestTimeoutError()), remainingMs);
    timer.unref?.();
  });

  try {
    return await Promise.race([observed, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
