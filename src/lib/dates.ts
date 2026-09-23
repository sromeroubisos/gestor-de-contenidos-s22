// Date helpers. Internally dates are ISO strings (yyyy-mm-dd) in local time and
// times are "HH:MM". Google Sheets returns dates as serial numbers when read with
// dateTimeRenderOption=SERIAL_NUMBER (days since 1899-12-30).

const SHEETS_EPOCH_UTC = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;

export const DAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
export const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const pad = (n: number) => String(n).padStart(2, "0");

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(now = new Date()): string {
  return toISO(now);
}

export function addDays(iso: string, n: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** Monday of the ISO week containing `iso`. */
export function startOfWeek(iso: string): string {
  const d = fromISO(iso);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return toISO(d);
}

export function isoWeek(iso: string): number {
  const d = fromISO(iso);
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((t.getTime() - firstThursday.getTime()) / DAY_MS - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

export function serialToISO(serial: number): string {
  const ms = SHEETS_EPOCH_UTC + Math.floor(serial) * DAY_MS;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function serialToTime(serial: number): string {
  const frac = serial - Math.floor(serial);
  let mins = Math.round(frac * 24 * 60);
  if (mins >= 24 * 60) mins = 0;
  return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
}

/** Accepts a Sheets serial number, ISO, dd/mm/yyyy or d/m/yy. Returns ISO or null. */
export function parseDate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return serialToISO(v);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    const day = +m[1];
    const mon = +m[2];
    if (mon >= 1 && mon <= 12 && day >= 1 && day <= 31) return `${y}-${pad(mon)}-${pad(day)}`;
  }
  if (/^\d+(\.\d+)?$/.test(s)) return serialToISO(Number(s));
  return null;
}

/** Accepts a Sheets time serial (fraction of day), "10:00", "10:00:00", "10 hs". */
export function parseTime(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return serialToTime(v);
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[:.h](\d{2})?/i) ?? s.match(/^(\d{1,2})\s*(?:hs?)?$/i);
  if (m) {
    const h = +m[1];
    const min = m[2] ? +m[2] : 0;
    if (h < 24 && min < 60) return `${pad(h)}:${pad(min)}`;
  }
  if (/^0?\.\d+$/.test(s)) return serialToTime(Number(s));
  return null;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function formatDateLong(iso: string): string {
  const d = fromISO(iso);
  return `${DAY_NAMES[(d.getDay() + 6) % 7]} ${d.getDate()} de ${MONTH_NAMES[d.getMonth()]}`;
}

export function dayName(iso: string): string {
  return DAY_NAMES[(fromISO(iso).getDay() + 6) % 7];
}

export function slotFor(time: string | null): string {
  if (!time) return "Sin hora";
  const h = Number(time.slice(0, 2));
  const starts = [0, 6, 9, 12, 15, 18, 21];
  const labels = ["00:00–06:00", "06:00–09:00", "09:00–12:00", "12:00–15:00", "15:00–18:00", "18:00–21:00", "21:00–00:00"];
  let idx = 0;
  starts.forEach((s, i) => {
    if (h >= s) idx = i;
  });
  return labels[idx];
}

export function formatDateTime(d: Date): string {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
