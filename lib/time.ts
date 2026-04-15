/**
 * Time rounding utilities for timesheet entries.
 * PRD: round start time DOWN and end time UP to the nearest 15 minutes.
 */

/** Round minutes DOWN to nearest 15-min boundary. */
export function roundStartTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const roundedMinutes = Math.floor(m / 15) * 15;
  return `${String(h).padStart(2, "0")}:${String(roundedMinutes).padStart(2, "0")}`;
}

/** Round minutes UP to nearest 15-min boundary. May roll over to next hour. */
export function roundEndTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  if (m % 15 === 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  const roundedMinutes = Math.ceil(m / 15) * 15;
  if (roundedMinutes >= 60) {
    const newHour = h + 1;
    return `${String(newHour).padStart(2, "0")}:00`;
  }
  return `${String(h).padStart(2, "0")}:${String(roundedMinutes).padStart(2, "0")}`;
}

/** Calculate hours between two HH:mm time strings. */
export function calculateHours(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;
  const diff = endMinutes - startMinutes;
  if (diff <= 0) return 0;
  return Math.round((diff / 60) * 100) / 100;
}
