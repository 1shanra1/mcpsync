/**
 * Redact secrets in output to prevent accidental exposure of sensitive values.
 * Replaces ${VAR} patterns with [REDACTED].
 */
export function redactSecrets(obj: unknown): unknown {
  if (typeof obj === 'string') {
    // Redact ${...} patterns
    return obj.replace(/\$\{[^}]+\}/g, '[REDACTED]');
  }
  if (Array.isArray(obj)) {
    return obj.map(redactSecrets);
  }
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = redactSecrets(value);
    }
    return result;
  }
  return obj;
}
