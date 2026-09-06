import { Secret, TOTP } from "otpauth";

/**
 * RFC 6238 TOTP per ARCHITECTURE_DECISIONS.md §4.1: 30-second period, six
 * digits, SHA-1 (for authenticator-app compatibility), one adjacent time
 * step permitted (otpauth's own `window` default is already 1 -- kept
 * explicit rather than relying on the default). Successful steps cannot be
 * replayed: callers must compare the returned `acceptedStep` against
 * `staff_mfa_credentials.last_accepted_step` and reject a re-used step.
 */
const PERIOD_SECONDS = 30;
const DIGITS = 6;
const ALGORITHM = "SHA1";
const WINDOW = 1;

export function generateTotpSecret(): Secret {
  return new Secret({ size: 20 });
}

export function totpProvisioningUri(params: {
  secret: Secret;
  accountEmail: string;
  issuer?: string;
}): string {
  const totp = new TOTP({
    issuer: params.issuer ?? "AusTechMap",
    label: params.accountEmail,
    secret: params.secret,
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: PERIOD_SECONDS,
  });
  return totp.toString();
}

export interface TotpValidationResult {
  valid: boolean;
  /** The absolute counter step that was accepted, for replay-prevention bookkeeping. */
  acceptedStep: number | null;
}

export function validateTotpToken(params: {
  token: string;
  secret: Secret;
  lastAcceptedStep: number | null;
  now?: Date;
}): TotpValidationResult {
  const timestamp = (params.now ?? new Date()).getTime();
  const delta = TOTP.validate({
    token: params.token,
    secret: params.secret,
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: PERIOD_SECONDS,
    window: WINDOW,
    timestamp,
  });
  if (delta === null) {
    return { valid: false, acceptedStep: null };
  }
  const currentStep = TOTP.counter({ period: PERIOD_SECONDS, timestamp });
  const acceptedStep = currentStep + delta;
  if (
    params.lastAcceptedStep !== null &&
    acceptedStep <= params.lastAcceptedStep
  ) {
    return { valid: false, acceptedStep: null };
  }
  return { valid: true, acceptedStep };
}
