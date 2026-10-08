/** Escape a literal string for use inside a RegExp. */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Matches a phone number by its digits, in whatever format the page shows. */
export function phonePattern(value: string): RegExp {
  const digits = value.replace(/\D/g, '');
  return new RegExp(digits.split('').join('\\D*'));
}

/** Escapes a value for a single-quoted SOQL string literal. */
export function soqlString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}
