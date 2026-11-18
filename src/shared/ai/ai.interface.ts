/**
 * Provider-neutral generation request. Every field describes *what* the model
 * must produce, never *how* a specific vendor implements it.
 */
export interface AiGenerationRequest {
  /** System-level behaviour and output constraints. */
  systemInstruction: string;

  /** Untrusted user content, always framed as data, never as instructions. */
  userPrompt: string;

  /** JSON Schema the response is expected to satisfy, when supported. */
  responseJsonSchema?: Record<string, unknown>;

  temperature?: number;

  maxOutputTokens?: number;

  /**
   * Shared deadline owned by the caller. When aborted, the provider must stop
   * waiting for the response.
   */
  signal?: AbortSignal;

  /**
   * Remaining budget for this attempt in milliseconds. Providers map it to
   * their own per-request timeout. The shared `signal` remains authoritative
   * for the total budget.
   */
  timeoutMs?: number;
}

export interface AiGenerationResult {
  /** Raw model text. Parsing and validation belong to the caller. */
  text: string;

  /** Model identifier that produced the text. */
  model: string;
}

export interface AiProvider {
  readonly name: string;

  generate(request: AiGenerationRequest): Promise<AiGenerationResult>;
}
