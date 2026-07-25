import type { Due } from "./types";

export function localDate(now: Date): string {
  const year = String(now.getFullYear()).padStart(4, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function offsetDateTime(now: Date): string {
  const offset = -now.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const hh = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0");
  const mm = String(Math.abs(offset) % 60).padStart(2, "0");
  const year = String(now.getFullYear()).padStart(4, "0");
  return `${year}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}.${String(now.getMilliseconds()).padStart(3, "0")}${sign}${hh}:${mm}`;
}

export function dueNow(due: Due | null, now: Date): boolean {
  if (due === null) return true;
  return due.kind === "day" ? localDate(now) >= due.date : now.getTime() >= Date.parse(due.at);
}

export function eventOccurredToday(at: string, now: Date): boolean {
  const event = new Date(at);
  return Number.isFinite(event.getTime()) && localDate(event) === localDate(now);
}
