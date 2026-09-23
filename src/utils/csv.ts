// Spreadsheet apps (Excel, LibreOffice, Google Sheets) auto-evaluate a cell
// that starts with one of these characters as a formula when a CSV is
// imported/opened -- neutralize it before the normal quote-escaping so a
// user- or agent-controlled string (an automation name, an error message, a
// proposed mirror URL, ...) can't smuggle a live formula into someone's
// export. See OWASP's CSV injection guidance.
const FORMULA_PREFIX_PATTERN = /^[=+\-@\t\r]/;

/**
 * Escapes a single CSV field: neutralizes a leading formula-trigger
 * character, then quotes the field if it contains a comma, quote, or
 * newline. Shared by every CSV export in the app so the same protection
 * can't be forgotten in a new one.
 */
export function csvEscape(value: string): string {
  const neutralized = FORMULA_PREFIX_PATTERN.test(value) ? `'${value}` : value;
  if (/[",\n\r]/.test(neutralized)) {
    return `"${neutralized.replace(/"/g, '""')}"`;
  }
  return neutralized;
}
