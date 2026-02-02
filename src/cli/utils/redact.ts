/**
 * Redact secrets in output to prevent accidental exposure of sensitive values.
 */

// Patterns that look like env var references
const ENV_PATTERNS = [
  /\$\{[^}]+\}/g, // ${VAR}
  /\$[A-Z_][A-Z0-9_]*/g, // $VAR (bare, uppercase only to avoid false positives)
  /\{env:[^}]+\}/g, // {env:VAR} (OpenCode/Roo style)
];

// Keys that typically contain secrets (for object key-based redaction)
const SENSITIVE_KEY_PATTERN = /^.*(TOKEN|SECRET|KEY|PASSWORD|CREDENTIAL|AUTH).*$/i;

export function redactSecrets(obj: unknown): unknown {
  if (typeof obj === 'string') {
    let result = obj;
    for (const pattern of ENV_PATTERNS) {
      result = result.replace(pattern, '[REDACTED]');
    }
    return result;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSecrets(item));
  }

  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      // If key looks sensitive, redact the entire string value
      if (SENSITIVE_KEY_PATTERN.test(key) && typeof value === 'string') {
        result[key] = '[REDACTED]';
      } else {
        result[key] = redactSecrets(value);
      }
    }
    return result;
  }

  return obj;
}
