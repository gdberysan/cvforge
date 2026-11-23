/**
 * The employer's name as a person should see it. A posting from an agency
 * often names none, and the model then writes a placeholder ("Not
 * specified", "No especificado", "N/A") into the field. Shown, that reads as
 * if it were the company; treated as no company, the line simply leaves it
 * out. The stored value is untouched.
 */
const PLACEHOLDERS = new Set([
  'not specified',
  'unspecified',
  'not provided',
  'not stated',
  'unknown',
  'n/a',
  'na',
  'none',
  '-',
  'no especificado',
  'no especificada',
  'sin especificar',
  'desconocido',
  'desconocida',
  'no indicado',
  'no indicada',
])

export function companyName(raw: string | null | undefined): string {
  const name = (raw ?? '').trim()
  return PLACEHOLDERS.has(name.toLowerCase().replace(/[.\s]+$/, '')) ? '' : name
}
