// Team events (matches, coverages, trips…): who goes, when, and what has to be done.
// They live in the APP_EVENTOS tab. Every cell is plain text so humans can read and edit it in the Sheet.
import type { Cell } from "./codec";
import { addDays, parseDate, parseTime } from "./dates";
import { normalizeHeader } from "./schema";

export const EVENT_TYPES = ["Partido", "Cobertura", "Grabación", "Reunión", "Viaje", "Otro"];
export const EVENT_STATUSES = ["Confirmado", "A confirmar", "Cancelado"];
export const TEAM_ROLES = ["Fotos", "Video", "Stories", "Periodista", "Relato", "Conducción", "Producción", "Chofer"];

export const EVENT_ICON: Record<string, string> = {
  Partido: "🏉",
  Cobertura: "🎥",
  Grabación: "🎬",
  Reunión: "💬",
  Viaje: "🚐",
  Otro: "📌",
};

export interface TeamMember {
  name: string;
  role: string;
}

export interface EventTask {
  text: string;
  done: boolean;
  owner: string;
}

export interface TeamEvent {
  /** Stable React key. Same as id once saved. */
  key: string;
  id: string;
  rowHint: number;
  type: string;
  title: string;
  /** ISO yyyy-mm-dd or null */
  date: string | null;
  /** HH:MM or null */
  time: string | null;
  endTime: string | null;
  place: string;
  brand: string;
  team: TeamMember[];
  tasks: EventTask[];
  status: string;
  notes: string;
  createdBy: string;
  updatedAt: string;
  /** Comparable form of the row at load time, for conflict detection. */
  snapshot: string;
}

export type EventDraft = Pick<
  TeamEvent,
  "type" | "title" | "date" | "time" | "endTime" | "place" | "brand" | "team" | "tasks" | "status" | "notes"
>;

type EventField = keyof EventDraft | "id" | "createdBy" | "updatedAt";

/** Column order used when the app creates APP_EVENTOS. Reading goes by header name. */
export const EVENT_COLUMNS: [EventField, string][] = [
  ["id", "ID"],
  ["type", "Tipo"],
  ["title", "Título"],
  ["date", "Fecha"],
  ["time", "Hora"],
  ["endTime", "Hora fin"],
  ["place", "Lugar"],
  ["brand", "Marca"],
  ["team", "Equipo"],
  ["tasks", "Tareas"],
  ["status", "Estado"],
  ["notes", "Notas"],
  ["createdBy", "Creado por"],
  ["updatedAt", "Actualizado"],
];
export const EVENT_HEADERS = EVENT_COLUMNS.map(([, h]) => h);

/** Technical tab the app creates on the first event, next to APP_HISTORIAL / APP_COMENTARIOS. */
export const EVENTS_TAB = { title: "APP_EVENTOS", headers: EVENT_HEADERS } as const;

export type EventColumnMap = Partial<Record<EventField, number>>;

/** Maps fields to 0-based columns by header. Without headers (tab not created yet) uses the default order. */
export function mapEventColumns(headers: string[]): EventColumnMap {
  const norm = headers.map((h) => normalizeHeader(h ?? ""));
  const map: EventColumnMap = {};
  EVENT_COLUMNS.forEach(([field, header], i) => {
    if (!headers.length) map[field] = i;
    else {
      const idx = norm.indexOf(normalizeHeader(header));
      if (idx >= 0) map[field] = idx;
    }
  });
  return map;
}

export function emptyEvent(): EventDraft {
  return { type: "Partido", title: "", date: null, time: null, endTime: null, place: "", brand: "", team: [], tasks: [], status: "Confirmado", notes: "" };
}

// ---------- Team: "Santi (Fotos), Juli (Video), Caro" ----------

export function parseTeam(s: string): TeamMember[] {
  return s
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const m = x.match(/^(.*?)\s*\(([^)]*)\)$/);
      return m ? { name: m[1].trim(), role: m[2].trim() } : { name: x, role: "" };
    });
}

export function formatTeam(team: TeamMember[]): string {
  return team
    .filter((m) => m.name.trim())
    .map((m) => (m.role.trim() ? `${m.name.trim()} (${m.role.trim()})` : m.name.trim()))
    .join(", ");
}

// ---------- Tasks: one per line, "☐ Placa previa — Santi" / "☑ Llevar trípode" ----------

export function parseTasks(s: string): EventTask[] {
  return s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(☐|☑|✅|\[ ?\]|\[x\])?\s*(.*)$/i)!;
      const done = !!m[1] && /☑|✅|x/i.test(m[1]);
      const [text, owner = ""] = m[2].split(/\s+—\s+/);
      return { text: text.trim(), done, owner: owner.trim() };
    })
    .filter((t) => t.text);
}

export function formatTasks(tasks: EventTask[]): string {
  return tasks
    .filter((t) => t.text.trim())
    .map((t) => `${t.done ? "☑" : "☐"} ${t.text.trim()}${t.owner.trim() ? ` — ${t.owner.trim()}` : ""}`)
    .join("\n");
}

// ---------- Row ↔ event ----------

// A leading apostrophe is how the app forces plain text; Sheets usually hides it.
const str = (v: Cell) => (v === null || v === undefined ? "" : String(v).trim().replace(/^'/, ""));
const cell = (v: Cell) => (typeof v === "string" ? str(v) : v);

/** Comparable form: what matters for conflicts, independent of how Sheets typed each cell. */
export function eventFingerprint(e: EventDraft & { id: string }): string {
  return JSON.stringify([e.id, e.type, e.title, e.date, e.time, e.endTime, e.place, e.brand, formatTeam(e.team), formatTasks(e.tasks), e.status, e.notes]);
}

export function rowToEvent(row: Cell[], rowNumber: number, map: EventColumnMap): TeamEvent | null {
  const get = (f: EventField): Cell => (map[f] === undefined ? "" : row[map[f]!]);
  const id = str(get("id"));
  const title = str(get("title"));
  if (!id && !title) return null;
  const e: TeamEvent = {
    key: id || `fila-${rowNumber}`,
    id,
    rowHint: rowNumber,
    type: str(get("type")) || "Otro",
    title,
    date: parseDate(cell(get("date"))),
    time: parseTime(cell(get("time"))),
    endTime: parseTime(cell(get("endTime"))),
    place: str(get("place")),
    brand: str(get("brand")),
    team: parseTeam(str(get("team"))),
    tasks: parseTasks(str(get("tasks"))),
    status: str(get("status")) || "Confirmado",
    notes: str(get("notes")),
    createdBy: str(get("createdBy")),
    updatedAt: str(get("updatedAt")),
    snapshot: "",
  };
  e.snapshot = eventFingerprint(e);
  return e;
}

/**
 * Cell values for a full row, by column index. With `forceText`, values get a leading
 * apostrophe so USER_ENTERED writes keep them as text (dates stay ISO, "=x" is not a formula).
 */
export function eventToRow(
  e: EventDraft & { id: string; createdBy: string; updatedAt: string },
  map: EventColumnMap,
  forceText: boolean,
): string[] {
  const values: Record<EventField, string> = {
    id: e.id,
    type: e.type,
    title: e.title,
    date: e.date ?? "",
    time: e.time ?? "",
    endTime: e.endTime ?? "",
    place: e.place,
    brand: e.brand,
    team: formatTeam(e.team),
    tasks: formatTasks(e.tasks),
    status: e.status,
    notes: e.notes,
    createdBy: e.createdBy,
    updatedAt: e.updatedAt,
  };
  const cols = Object.values(map).filter((i): i is number => i !== undefined);
  const row = Array<string>(Math.max(-1, ...cols) + 1).fill("");
  (Object.keys(map) as EventField[]).forEach((f) => {
    const v = values[f].trim();
    row[map[f]!] = forceText && v ? `'${v}` : v;
  });
  return row;
}

export function newEventId(now = Date.now()): string {
  // Time-based so two people creating at once never collide.
  return `EV-${now.toString(36).toUpperCase()}`;
}

// ---------- Helpers for the UI ----------

export const isCancelled = (e: TeamEvent) => /^cancel/i.test(e.status);
export const isTentative = (e: TeamEvent) => /confirmar|tentativ/i.test(e.status);

export function sortEvents(a: TeamEvent, b: TeamEvent): number {
  return `${a.date ?? "9999"} ${a.time ?? "99"}`.localeCompare(`${b.date ?? "9999"} ${b.time ?? "99"}`);
}

export const isGoing = (e: TeamEvent, name: string) => !!name && e.team.some((m) => m.name.toLowerCase() === name.toLowerCase());

export const pendingTasks = (e: TeamEvent) => e.tasks.filter((t) => !t.done).length;

// ---------- Calendar export ----------

const compact = (iso: string) => iso.replace(/-/g, "");
const compactTime = (t: string) => `${t.replace(":", "")}00`;

function plusTwoHours(date: string, time: string): { date: string; time: string } {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + 120;
  const mins = total % 1440;
  return { date: addDays(date, Math.floor(total / 1440)), time: `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}` };
}

/** Start/end in calendar format. Timed events without end last 2 hours; untimed ones are all-day. */
function span(e: TeamEvent): { allDay: boolean; start: string; end: string } | null {
  if (!e.date) return null;
  if (!e.time) return { allDay: true, start: compact(e.date), end: compact(addDays(e.date, 1)) };
  const end = !e.endTime
    ? plusTwoHours(e.date, e.time)
    : { date: e.endTime > e.time ? e.date : addDays(e.date, 1), time: e.endTime };
  return { allDay: false, start: `${compact(e.date)}T${compactTime(e.time)}`, end: `${compact(end.date)}T${compactTime(end.time)}` };
}

export function eventDetails(e: TeamEvent): string {
  const lines = [`${e.type}${e.brand ? ` · ${e.brand}` : ""}${isTentative(e) ? " · A confirmar" : ""}`];
  if (e.team.length) lines.push("", "Van:", ...e.team.map((m) => `• ${m.name}${m.role ? ` — ${m.role}` : ""}`));
  if (e.tasks.length) lines.push("", "Tareas:", ...e.tasks.map((t) => `${t.done ? "☑" : "☐"} ${t.text}${t.owner ? ` (${t.owner})` : ""}`));
  if (e.notes) lines.push("", e.notes);
  return lines.join("\n");
}

export const eventTitle = (e: TeamEvent) => `${EVENT_ICON[e.type] ?? "📌"} ${e.title || e.type}`;

/** "Agregar a Google Calendar" link. Needs no login or API: opens the prefilled form. */
export function googleCalendarUrl(e: TeamEvent, timeZone?: string): string | null {
  const s = span(e);
  if (!s) return null;
  const q = new URLSearchParams({ action: "TEMPLATE", text: eventTitle(e), dates: `${s.start}/${s.end}`, details: eventDetails(e) });
  if (e.place) q.set("location", e.place);
  if (timeZone && !s.allDay) q.set("ctz", timeZone);
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

const icsEscape = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Folds lines at 75 characters as RFC 5545 asks. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    out.push(rest.slice(0, 75));
    rest = ` ${rest.slice(75)}`;
  }
  out.push(rest);
  return out.join("\r\n");
}

/** iCalendar file. Cancelled and undated events are left out. */
export function toICS(events: TeamEvent[], opts: { timeZone?: string; name?: string; now?: Date } = {}): string {
  const stamp = (opts.now ?? new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const tz = opts.timeZone;
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Grupo 22//Content Manager//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  if (opts.name) lines.push(`X-WR-CALNAME:${icsEscape(opts.name)}`);
  if (tz) lines.push(`X-WR-TIMEZONE:${tz}`);
  for (const e of events) {
    const s = span(e);
    if (!s || isCancelled(e)) continue;
    const when = (k: string, v: string) => (s.allDay ? `${k};VALUE=DATE:${v}` : tz ? `${k};TZID=${tz}:${v}` : `${k}:${v}`);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id || e.key}@grupo22-cm`,
      `DTSTAMP:${stamp}`,
      when("DTSTART", s.start),
      when("DTEND", s.end),
      `SUMMARY:${icsEscape(eventTitle(e))}`,
      `DESCRIPTION:${icsEscape(eventDetails(e))}`,
    );
    if (e.place) lines.push(`LOCATION:${icsEscape(e.place)}`);
    if (isTentative(e)) lines.push("STATUS:TENTATIVE");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
