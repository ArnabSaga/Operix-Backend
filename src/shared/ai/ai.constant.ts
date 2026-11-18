export const AI_PROVIDER = Symbol('AI_PROVIDER');

export const GEMINI_PROVIDER_NAME = 'gemini';

/**
 * Hard ceiling on provider calls for a single AI generation. One original
 * attempt plus at most one semantic retry after unusable model output.
 */
export const AI_MAX_ATTEMPTS = 2;

/**
 * A retry is only attempted when at least this much of the shared deadline
 * remains. Below it, a second provider call cannot finish usefully and would
 * only consume the remaining budget.
 */
export const AI_MIN_RETRY_BUDGET_MS = 2_000;

export const AI_DEFAULT_TEMPERATURE = 0.4;

export const AI_DEFAULT_MAX_OUTPUT_TOKENS = 1_500;
