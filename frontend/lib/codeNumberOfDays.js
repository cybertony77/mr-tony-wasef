/**
 * Shared helpers for VVC/VHC code settings: number_of_days access window.
 * All calendar-day math uses Africa/Cairo (Egypt).
 */

import {
  toEgyptYmd,
  getEgyptYmdToday,
  addDaysEgyptYmd,
  compareEgyptYmd,
} from './egyptDateTime';

export function isCodeNumberOfDaysValid(accessStartedAt, numberOfDays) {
  const days = Number(numberOfDays);
  if (Number.isNaN(days) || days < 0) return false;
  if (days === 0) return false;
  if (!accessStartedAt) return true;
  const firstYmd = toEgyptYmd(accessStartedAt);
  if (!firstYmd) return false;
  const expiresYmd = addDaysEgyptYmd(firstYmd, days); // exclusive end (valid while today < expires)
  const todayYmd = getEgyptYmdToday();
  if (!expiresYmd || !todayYmd) return false;
  return compareEgyptYmd(todayYmd, expiresYmd) < 0;
}

/** Last inclusive calendar day as YYYY-MM-DD (Egypt) for client deadline_date checks. */
export function computeAccessDeadlineDate(accessStartedAt, numberOfDays) {
  const days = Number(numberOfDays);
  if (!accessStartedAt || Number.isNaN(days) || days <= 0) return null;
  const firstYmd = toEgyptYmd(accessStartedAt);
  if (!firstYmd) return null;
  return addDaysEgyptYmd(firstYmd, days - 1);
}
