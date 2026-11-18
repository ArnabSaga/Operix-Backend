/**
 * Provider-neutral failure classification. The provider translates SDK- or
 * vendor-specific failures into one of these kinds so that `AiService` can map
 * them to stable Operix error codes without leaking provider internals.
 *
 * `TIMEOUT` is deliberately distinct from `UNAVAILABLE`: a deadline we imposed
 * is operationally different from a provider outage, and folding the two
 * together made a slow request indistinguishable from a broken provider both
 * in logs and in client copy.
 */
export type AiProviderErrorKind =
  'RATE_LIMITED' | 'UNAVAILABLE' | 'TIMEOUT' | 'FAILED';

/**
 * Internal, log-only refinement of `kind`.
 *
 * This never reaches a client. It exists so that an operator can tell a bad
 * request, a rejected credential, a forbidden project, and an unknown model
 * apart from a transient outage, which all used to collapse into
 * `AI_PROVIDER_UNAVAILABLE`.
 */
export type AiProviderErrorClassification =
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_BAD_REQUEST'
  | 'PROVIDER_AUTH_REJECTED'
  | 'PROVIDER_FORBIDDEN'
  | 'PROVIDER_MODEL_NOT_FOUND'
  | 'PROVIDER_SERVER_ERROR'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_NOT_CONFIGURED'
  | 'PROVIDER_EMPTY_RESPONSE'
  | 'PROVIDER_UNKNOWN';

export class AiProviderError extends Error {
  readonly classification: AiProviderErrorClassification;

  constructor(
    readonly kind: AiProviderErrorKind,
    message: string,
    readonly providerStatus: number | null = null,
    classification?: AiProviderErrorClassification,
  ) {
    super(message);
    this.name = 'AiProviderError';
    this.classification = classification ?? classificationForKind(kind);
  }
}

function classificationForKind(
  kind: AiProviderErrorKind,
): AiProviderErrorClassification {
  switch (kind) {
    case 'RATE_LIMITED':
      return 'PROVIDER_RATE_LIMITED';
    case 'UNAVAILABLE':
      return 'PROVIDER_UNAVAILABLE';
    case 'TIMEOUT':
      return 'PROVIDER_TIMEOUT';
    case 'FAILED':
      return 'PROVIDER_UNKNOWN';
  }
}
