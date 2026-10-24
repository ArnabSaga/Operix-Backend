/**
 * Provider-neutral failure classification. The provider translates SDK- or
 * vendor-specific failures into one of these kinds so that `AiService` can map
 * them to stable Operix error codes without leaking provider internals.
 */
export type AiProviderErrorKind = 'RATE_LIMITED' | 'UNAVAILABLE' | 'FAILED';

export class AiProviderError extends Error {
  constructor(
    readonly kind: AiProviderErrorKind,
    message: string,
    readonly providerStatus: number | null = null,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}
