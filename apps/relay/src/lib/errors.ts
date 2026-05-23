import { RateLimitExceededError, XRPCError } from '@atcute/xrpc-server';

// Re-export the error classes handlers throw, so call sites import from one place.
// The router's default exception handler turns any thrown `XRPCError` into the
// correct HTTP response, so handlers should always `throw` these (never return
// ad-hoc error JSON).
export {
  AuthRequiredError,
  ForbiddenError,
  RateLimitExceededError,
  XRPCError,
} from '@atcute/xrpc-server';

/**
 * 403 with the lexicon-declared `NotAuthorized` error name (used by `send` and
 * `requestPermission`). We use a raw `XRPCError` rather than `ForbiddenError`
 * because the latter's error name is `Forbidden`.
 */
export function notAuthorized(message = 'Not authorized to notify this recipient'): XRPCError {
  return new XRPCError({ status: 403, error: 'NotAuthorized', message });
}

/** 400 `InvalidRequest` — e.g. an unknown management method in the envelope. */
export function invalidRequest(message = 'Invalid request'): XRPCError {
  return new XRPCError({ status: 400, error: 'InvalidRequest', message });
}

/**
 * 429 `RateLimitExceeded` with a `Retry-After` header (whole seconds, min 1).
 */
export function rateLimited(
  retryAfterSeconds: number,
  message = 'Rate limit exceeded',
): RateLimitExceededError {
  const seconds = Math.max(1, Math.ceil(retryAfterSeconds));
  return new RateLimitExceededError({
    message,
    headers: { 'Retry-After': String(seconds) },
  });
}
