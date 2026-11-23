/**
 * The product's name, chosen at build time. The web edition and its
 * extension are "Rumbo" (web/next.config.ts and the Worker build set it);
 * the desktop app people bought stays "CVForge". Every user-visible string
 * says CVForge in the dictionary and is shown under this name (lib/i18n), so
 * there is one place the name comes from.
 *
 * Only what people read changes: storage keys, lock names, file names and
 * message types keep "cvforge", or existing data would be orphaned.
 */
export const BRAND: string = process.env.NEXT_PUBLIC_BRAND || 'CVForge'
