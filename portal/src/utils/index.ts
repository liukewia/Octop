/**
 * Pure utility helpers.
 * Must not import from api/, store/, hooks/, or components/.
 */

/** Format an ISO date string to a localised display string */
export function formatDate(iso: string, locale = "en"): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso));
}
