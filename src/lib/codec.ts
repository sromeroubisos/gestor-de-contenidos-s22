// Converts Sheet rows ↔ Post objects, and a PostPatch into the minimal set of cell writes.
import { dayName, isoWeek, MONTH_NAMES, fromISO, parseDate, parseTime, slotFor, formatDate } from "./dates";
import { FIELD_LABELS, type ColumnMap } from "./schema";
import { DERIVED_FIELDS, type FieldKey, type Post, type PostPatch, type PostSource } from "./types";

export type Cell = string | number | boolean | null | undefined;

const str = (v: Cell) => (v === null || v === undefined ? "" : String(v).trim());

export function splitList(s: string): string[] {
  return s
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Header name used as snapshot key (unique even with duplicated/empty headers). */
export const headerKey = (headers: string[], i: number) => `${headers[i] || "col"}#${i}`;

/** Comparable string for a cell, so "20/01/2026" and serial 46042 compare equal. */
function normalizeCell(field: FieldKey | undefined, v: Cell): string {
  if (field === "date") return parseDate(v) ?? str(v);
  if (field === "time") return parseTime(v) ?? str(v);
  return str(v);
}

export interface SheetCtx {
  title: string;
  source: PostSource;
  headers: string[];
  map: ColumnMap;
  /** 0-based column indexes that contain formulas: never written. */
  protectedCols: Set<number>;
}

function fieldAt(map: ColumnMap, i: number): FieldKey | undefined {
  return (Object.keys(map) as FieldKey[]).find((k) => map[k] === i);
}

export function rowToPost(row: Cell[], rowNumber: number, ctx: SheetCtx): Post | null {
  const get = (k: FieldKey): Cell => (ctx.map[k] === undefined ? "" : row[ctx.map[k]!]);
  const id = str(get("id"));
  const title = str(get("title"));
  if (!id && !title) return null;

  const snapshot: Record<string, string> = {};
  const extra: Record<string, string> = {};
  ctx.headers.forEach((h, i) => {
    const f = fieldAt(ctx.map, i);
    snapshot[headerKey(ctx.headers, i)] = normalizeCell(f, row[i]);
    if (!f && h && str(row[i])) extra[h] = str(row[i]);
  });

  return {
    // Scoped by tab: CONTENIDOS and HISTÓRICO can hold the same ID (e.g. G22-0001 in both).
    key: `${ctx.source}:${id || rowNumber}`,
    id,
    source: ctx.source,
    sheetTitle: ctx.title,
    rowHint: rowNumber,
    brand: str(get("brand")),
    date: parseDate(get("date")),
    time: parseTime(get("time")),
    platform: str(get("platform")),
    type: str(get("type")),
    title,
    copy: str(get("copy")),
    status: str(get("status")),
    owner: str(get("owner")),
    priority: str(get("priority")),
    link: str(get("link")),
    sponsors: splitList(str(get("sponsors"))),
    notes: str(get("notes")),
    origin: str(get("origin")),
    extra,
    snapshot,
  };
}

export function emptyPost(ctx: Pick<SheetCtx, "source" | "title">, row: number): Post {
  return {
    key: `${ctx.source}:${row}`, id: "", source: ctx.source, sheetTitle: ctx.title, rowHint: row,
    brand: "", date: null, time: null, platform: "", type: "", title: "", copy: "", status: "",
    owner: "", priority: "", link: "", sponsors: [], notes: "", origin: "", extra: {}, snapshot: {},
  };
}

/** Columns whose value differs between the loaded snapshot and the current Sheet row. */
export function changedColumns(before: Post, now: Post, ctx: SheetCtx): string[] {
  const out: string[] = [];
  ctx.headers.forEach((h, i) => {
    if (ctx.protectedCols.has(i)) return;
    const f = fieldAt(ctx.map, i);
    if (f && DERIVED_FIELDS.includes(f)) return;
    const k = headerKey(ctx.headers, i);
    if ((before.snapshot[k] ?? "") !== (now.snapshot[k] ?? "")) out.push(h || `Columna ${i + 1}`);
  });
  return out;
}

/** Text written with USER_ENTERED must not become a formula. */
export function safeText(s: string): string {
  return /^[=+\-@]/.test(s) ? `'${s}` : s;
}

export interface CellWrite {
  col: number;
  value: string | number;
}

export interface ChangeLog {
  field: string;
  oldValue: string;
  newValue: string;
}

function display(field: keyof PostPatch, v: unknown): string {
  if (field === "date") return formatDate((v as string | null) ?? null);
  if (Array.isArray(v)) return v.join(", ");
  return v === null || v === undefined ? "" : String(v);
}

/**
 * Computes the cells to write for a patch. Only changed fields are written; formula
 * columns are skipped. When the sheet stores Día/Mes/Año/Semana/Inicio/Franja as plain
 * values (🗄️ HISTÓRICO), they are recalculated so they stay consistent.
 */
export function buildWrites(post: Post, patch: PostPatch, ctx: SheetCtx): { writes: CellWrite[]; changes: ChangeLog[] } {
  const writes: CellWrite[] = [];
  const changes: ChangeLog[] = [];
  const put = (field: FieldKey, value: string | number) => {
    const col = ctx.map[field];
    if (col === undefined || ctx.protectedCols.has(col)) return;
    writes.push({ col, value });
  };

  (Object.keys(patch) as (keyof PostPatch)[]).forEach((field) => {
    const next = patch[field];
    const prev = post[field];
    if (display(field, next) === display(field, prev)) return;
    changes.push({ field: FIELD_LABELS[field], oldValue: display(field, prev), newValue: display(field, next) });
    if (field === "date") put("date", (next as string | null) ?? "");
    else if (field === "time") put("time", (next as string | null) ?? "");
    else if (field === "sponsors") put("sponsors", safeText((next as string[]).join(", ")));
    else put(field, safeText(String(next ?? "")));
  });

  const dateChanged = "date" in patch && patch.date !== post.date;
  const timeChanged = "time" in patch && patch.time !== post.time;
  if (dateChanged || timeChanged) {
    const date = "date" in patch ? (patch.date ?? null) : post.date;
    const time = "time" in patch ? (patch.time ?? null) : post.time;
    // `put` already skips protected (formula) columns, so this only affects plain-value sheets.
    put("day", date ? dayName(date) : "");
    put("month", date ? MONTH_NAMES[fromISO(date).getMonth()] : "");
    put("year", date ? fromISO(date).getFullYear() : "");
    put("week", date ? isoWeek(date) : "");
    put("startAt", date ? `${date} ${time ?? "00:00"}` : "");
    put("slot", slotFor(time));
  }
  return { writes, changes };
}

export function nextId(ids: string[], prefix = "G22-", width = 4): string {
  let max = 0;
  for (const id of ids) {
    const m = String(id).match(/(\d+)\s*$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${String(max + 1).padStart(width, "0")}`;
}
