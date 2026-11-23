/**
 * ASCII only. The name goes into a Content-Disposition header, which is a
 * byte string: a letter outside Latin-1 (Łukasz, Владимир, 田中) made the
 * header constructor throw and every export — and the studio preview, which
 * is the same route — answer 500. Diacritics fold; anything that does not
 * fold is dropped, and a name that folds to nothing falls back to "CV".
 */
export function buildFilename(fullName: string, company: string, ext = 'pdf'): string {
  const slug = (value: string) =>
    value
      .normalize('NFD')
      // Combining diacritical marks. MUST be written as unicode escapes —
      // literal combining marks are invisible in source and get mangled by
      // editors and copy-paste.
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')

  const name = slug(fullName)
  const org = slug(company)
  return `${name ? `${name}-` : ''}CV${org ? `-${org}` : ''}.${ext}`
}
