/**
 * Calendar dates in the user's own timezone.
 *
 * Every date in this app is a bare `YYYY-MM-DD` string meaning "the day the user
 * was living in", never an instant. `toISOString()` is the wrong tool for that:
 * it converts to UTC first, so in Ukraine (UTC+2/+3) any date built from a local
 * midnight — or read before ~03:00 — comes back as the previous day. That put the
 * week planner's "today" marker on a different day than the workout the user had
 * just logged. These helpers only ever read local calendar fields.
 */

/** Local calendar date of a Date object, as `YYYY-MM-DD`. */
export function isoDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Parse `YYYY-MM-DD` back into a Date anchored at local noon. Noon, not
 * midnight, so that a DST shift in either direction cannot push the date across
 * a day boundary.
 */
export function parseISO(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

/** The local calendar date N days before today. */
export function daysAgoISO(days, from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 12);
  d.setDate(d.getDate() - days);
  return isoDate(d);
}

/** The local calendar date N days after an ISO date. */
export function addDaysISO(iso, days) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

/** Monday of the week containing `iso` (weeks start on Monday here). */
export function mondayOfISO(iso) {
  const d = parseISO(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return isoDate(d);
}

/** Whole days between two ISO dates (b − a); negative when b is earlier. */
export function daysBetween(a, b) {
  return Math.round((parseISO(b) - parseISO(a)) / 86400000);
}
