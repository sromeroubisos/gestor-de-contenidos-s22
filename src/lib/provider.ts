// DataProvider: the only layer that knows where data lives. Today it's Google Sheets;
// a SupabaseDataProvider could implement the same interface later.
import type { Transport } from "./google";
import { buildWrites, changedColumns, emptyPost, nextId, rowToPost, safeText, type Cell, type SheetCtx } from "./codec";
import { formatDateTime } from "./dates";
import { eventFingerprint, eventToRow, EVENTS_TAB, mapEventColumns, newEventId, rowToEvent, type EventDraft, type TeamEvent } from "./events";
import { APP_TABS, columnLetter, looksLikePostsTable, mapColumns, normalizeHeader, quoteSheet } from "./schema";
import {
  ConflictError,
  DERIVED_FIELDS,
  type CommentEntry,
  type HistoryEntry,
  type Lists,
  type Post,
  type PostPatch,
  type SheetInfo,
  type SheetRole,
  type WorkbookMap,
} from "./types";

export interface Snapshot {
  posts: Post[];
  events: TeamEvent[];
  lists: Lists;
  workbook: WorkbookMap | null;
}

export interface DataProvider {
  readonly kind: "google" | "demo";
  load(reanalyze?: boolean): Promise<Snapshot>;
  updatePost(post: Post, patch: PostPatch, user: string): Promise<Post>;
  createPost(patch: PostPatch, user: string): Promise<Post>;
  getHistory(postId?: string): Promise<HistoryEntry[]>;
  getComments(postId: string): Promise<CommentEntry[]>;
  addComment(postId: string, text: string, user: string): Promise<void>;
  /** Creates the event when `prev` is null; otherwise updates it (failing if someone changed it meanwhile). */
  saveEvent(prev: TeamEvent | null, draft: EventDraft, user: string): Promise<TeamEvent>;
}

export const EVENT_CONFLICT = "Este evento fue modificado por otro usuario. Actualizá los datos antes de guardar.";

export class GoogleSheetsDataProvider implements DataProvider {
  readonly kind = "google" as const;
  private workbook: WorkbookMap | null = null;
  private ctx: { contenidos?: SheetCtx; historico?: SheetCtx } = {};

  constructor(
    private t: Transport,
    private spreadsheetId: string,
  ) {}

  /** Reads tab names + header rows and decides which tab plays which role. Never modifies anything. */
  private async analyze(): Promise<void> {
    const meta = await this.t.meta();
    const firstRows = await this.t.batchGet(meta.sheets.map((p) => `${quoteSheet(p.title)}!1:1`), "FORMATTED");

    const sheets: SheetInfo[] = meta.sheets.map((p, i) => {
      const headers = (firstRows[i]?.[0] ?? []).map((c) => String(c ?? "").trim());
      return { ...p, headers, role: "unknown" as SheetRole };
    });

    const norm = (t: string) => normalizeHeader(t);
    for (const s of sheets) {
      const t = norm(s.title);
      const h = s.headers.map(norm);
      if (s.title === APP_TABS.history.title) s.role = "history";
      else if (s.title === APP_TABS.comments.title) s.role = "comments";
      else if (s.title === APP_TABS.attachments.title) s.role = "attachments";
      else if (s.title === EVENTS_TAB.title) s.role = "events";
      else if (h.includes("marcas") && h.includes("estados")) s.role = "config";
      else if (looksLikePostsTable(s.headers)) s.role = /historico|archivo|publicad/.test(t) ? "archive" : "posts";
      else if (/backup|original/.test(t)) s.role = "backup";
      else s.role = "view";
    }
    const pick = (role: SheetRole, prefer: RegExp) => {
      const c = sheets.filter((s) => s.role === role && !s.hidden);
      return (c.find((s) => prefer.test(norm(s.title))) ?? c[0])?.title ?? null;
    };

    this.workbook = {
      spreadsheetId: this.spreadsheetId,
      title: meta.title,
      locale: meta.locale,
      timeZone: meta.timeZone,
      sheets,
      postsSheet: pick("posts", /contenidos/),
      archiveSheet: pick("archive", /historico/),
      configSheet: pick("config", /configuracion/),
      analyzedAt: new Date().toISOString(),
    };

    // Formula detection: any column whose header or first data cell is a formula is read-only.
    const postTabs = [this.workbook.postsSheet, this.workbook.archiveSheet].filter(Boolean) as string[];
    const formulas = await this.t.batchGet(postTabs.map((t) => `${quoteSheet(t)}!1:2`), "FORMULA");
    this.ctx = {};
    postTabs.forEach((title, i) => {
      const info = sheets.find((s) => s.title === title)!;
      const map = mapColumns(info.headers);
      const protectedCols = new Set<number>();
      (formulas[i] ?? []).forEach((row) =>
        row.forEach((c, col) => typeof c === "string" && c.startsWith("=") && protectedCols.add(col)),
      );
      const source = title === this.workbook!.postsSheet ? "contenidos" : "historico";
      // Extra safety for the main table: derived columns are never written.
      if (source === "contenidos") DERIVED_FIELDS.forEach((f) => map[f] !== undefined && protectedCols.add(map[f]!));
      this.ctx[source] = { title, source, headers: info.headers, map, protectedCols };
    });
  }

  async load(reanalyze = false): Promise<Snapshot> {
    if (!this.workbook || reanalyze) await this.analyze();
    const wb = this.workbook!;
    const tabs = [this.ctx.contenidos, this.ctx.historico].filter(Boolean) as SheetCtx[];
    const ranges = tabs.map((c) => `${quoteSheet(c.title)}!A2:${columnLetter(c.headers.length - 1)}`);
    const configIdx = wb.configSheet ? ranges.push(`${quoteSheet(wb.configSheet)}!A1:Z200`) - 1 : -1;
    const eventsTab = this.eventsTab();
    const eventsIdx = eventsTab ? ranges.push(`${quoteSheet(eventsTab.title)}!A2:${columnLetter(Math.max(eventsTab.headers.length, 1) - 1)}`) - 1 : -1;
    const data = await this.t.batchGet(ranges);

    const posts: Post[] = [];
    tabs.forEach((ctx, i) => {
      (data[i] ?? []).forEach((row, r) => {
        const p = rowToPost(row as Cell[], r + 2, ctx);
        if (p) posts.push(p);
      });
    });
    const lists = parseConfig(configIdx >= 0 ? ((data[configIdx] ?? []) as Cell[][]) : [], posts);

    const events: TeamEvent[] = [];
    if (eventsTab) {
      const map = mapEventColumns(eventsTab.headers);
      (data[eventsIdx] ?? []).forEach((row, r) => {
        const e = rowToEvent(row as Cell[], r + 2, map);
        if (e) events.push(e);
      });
    }
    return { posts, events, lists, workbook: wb };
  }

  private rowRange(ctx: SheetCtx, row: number) {
    return `${quoteSheet(ctx.title)}!A${row}:${columnLetter(ctx.headers.length - 1)}${row}`;
  }

  /** Finds the current row of a post by its ID (rows can move), trying the last known row first. */
  private async locate(post: Post, ctx: SheetCtx): Promise<{ row: number; current: Post }> {
    const [hinted] = await this.t.batchGet([this.rowRange(ctx, post.rowHint)]);
    const hintedPost = hinted[0] ? rowToPost(hinted[0] as Cell[], post.rowHint, ctx) : null;
    if (hintedPost && (post.id ? hintedPost.id === post.id : hintedPost.title === post.title)) {
      return { row: post.rowHint, current: hintedPost };
    }
    if (!post.id) throw new Error("La fila de esta publicación cambió. Actualizá los datos antes de guardar.");
    const col = columnLetter(ctx.map.id!);
    const [ids] = await this.t.batchGet([`${quoteSheet(ctx.title)}!${col}:${col}`]);
    const idx = ids.findIndex((r) => String(r[0] ?? "").trim() === post.id);
    if (idx < 0) throw new Error(`No se encontró ${post.id} en el Sheet (¿fue borrada o movida de pestaña?).`);
    const row = idx + 1;
    const [values] = await this.t.batchGet([this.rowRange(ctx, row)]);
    return { row, current: rowToPost((values[0] ?? []) as Cell[], row, ctx)! };
  }

  private async writeCells(ctx: SheetCtx, row: number, writes: { col: number; value: string | number }[]) {
    if (!writes.length) return;
    const n = await this.t.batchUpdate(
      writes.map((w) => ({ range: `${quoteSheet(ctx.title)}!${columnLetter(w.col)}${row}`, values: [[w.value]] })),
    );
    if (n < writes.length) throw new Error("Google Sheets no confirmó todos los cambios.");
  }

  private async reread(ctx: SheetCtx, row: number): Promise<Post> {
    const [values] = await this.t.batchGet([this.rowRange(ctx, row)]);
    const p = values[0] ? rowToPost(values[0] as Cell[], row, ctx) : null;
    if (!p) throw new Error("No se pudo confirmar la escritura en Google Sheets.");
    return p;
  }

  async updatePost(post: Post, patch: PostPatch, user: string): Promise<Post> {
    const ctx = this.ctx[post.source];
    if (!ctx) throw new Error("La pestaña de esta publicación no está disponible.");
    const { row, current } = await this.locate(post, ctx);

    const changed = changedColumns(post, current, ctx);
    if (changed.length) throw new ConflictError(post.id, changed);

    const { writes, changes } = buildWrites(post, patch, ctx);
    let id = post.id;
    if (!id) {
      id = await this.generateId();
      writes.push({ col: ctx.map.id!, value: id });
    }
    await this.writeCells(ctx, row, writes);
    const saved = await this.reread(ctx, row);
    await this.log(changes.map((c) => ({ ...c, action: "Editar", postId: id })), user);
    return saved;
  }

  private async generateId(): Promise<string> {
    const tabs = [this.ctx.contenidos, this.ctx.historico].filter(Boolean) as SheetCtx[];
    const cols = await this.t.batchGet(tabs.map((c) => `${quoteSheet(c.title)}!${columnLetter(c.map.id!)}2:${columnLetter(c.map.id!)}`));
    // IDs must be unique across CONTENIDOS and HISTÓRICO.
    return nextId(cols.flat().map((r) => String(r[0] ?? "")));
  }

  async createPost(patch: PostPatch, user: string): Promise<Post> {
    const ctx = this.ctx.contenidos;
    if (!ctx) throw new Error("No se encontró la pestaña de contenidos.");
    const id = await this.generateId();

    // First empty row, looking only at columns the user fills (formula columns always have output).
    const [rows] = await this.t.batchGet([`${quoteSheet(ctx.title)}!A2:${columnLetter(ctx.headers.length - 1)}`]);
    let last = 1;
    rows.forEach((r, i) => {
      if (r.some((c, col) => !ctx.protectedCols.has(col) && String(c ?? "").trim() !== "")) last = i + 2;
    });
    const row = last + 1;

    const { writes } = buildWrites(emptyPost(ctx, row), patch, ctx);
    writes.push({ col: ctx.map.id!, value: id });
    if (ctx.map.origin !== undefined) writes.push({ col: ctx.map.origin, value: safeText(`App G22 · ${user}`) });
    await this.writeCells(ctx, row, writes);

    const saved = await this.reread(ctx, row);
    if (saved.id !== id) throw new Error("Otra persona creó una fila al mismo tiempo. Actualizá y volvé a intentar.");
    await this.log([{ action: "Crear", postId: id, field: "", oldValue: "", newValue: saved.title }], user);
    return saved;
  }

  // ---------- Technical tabs (APP_HISTORIAL / APP_COMENTARIOS) ----------

  private async append(tab: { title: string; headers: readonly string[] }, rows: string[][], role: SheetRole = "history") {
    if (!rows.length) return;
    if (!this.workbook?.sheets.some((s) => s.title === tab.title)) {
      await this.t.addSheet(tab.title, [...tab.headers]);
      this.workbook?.sheets.push({ sheetId: -1, title: tab.title, index: 999, hidden: false, headers: [...tab.headers], role });
    }
    await this.t.append(tab.title, rows);
  }

  private async log(entries: Omit<HistoryEntry, "timestamp" | "user">[], user: string) {
    const ts = formatDateTime(new Date());
    try {
      await this.append(APP_TABS.history, entries.map((e) => [ts, user, e.postId, e.action, e.field, e.oldValue, e.newValue]));
    } catch (e) {
      // The post change is already saved; a failed log must not undo it.
      console.warn("No se pudo registrar el historial", e);
    }
  }

  private async readTab(title: string): Promise<string[][]> {
    if (!this.workbook?.sheets.some((s) => s.title === title)) return [];
    const [rows] = await this.t.batchGet([`${quoteSheet(title)}!A2:H`], "FORMATTED");
    return rows.map((r) => r.map((c) => String(c ?? "")));
  }

  async getHistory(postId?: string): Promise<HistoryEntry[]> {
    const rows = await this.readTab(APP_TABS.history.title);
    return rows
      .map(([timestamp, user, id, action, field, oldValue, newValue]) => ({ timestamp, user, postId: id, action, field, oldValue, newValue }))
      .filter((h) => !postId || h.postId === postId)
      .reverse();
  }

  async getComments(postId: string): Promise<CommentEntry[]> {
    const rows = await this.readTab(APP_TABS.comments.title);
    return rows.filter((r) => r[2] === postId).map(([timestamp, user, id, text]) => ({ timestamp, user, postId: id, text }));
  }

  async addComment(postId: string, text: string, user: string): Promise<void> {
    await this.append(APP_TABS.comments, [[formatDateTime(new Date()), user, postId, text]]);
  }

  // ---------- Team events (APP_EVENTOS) ----------

  private eventsTab(): SheetInfo | undefined {
    return this.workbook?.sheets.find((s) => s.title === EVENTS_TAB.title);
  }

  async saveEvent(prev: TeamEvent | null, draft: EventDraft, user: string): Promise<TeamEvent> {
    const updatedAt = `${formatDateTime(new Date())} · ${user}`;
    const tab = this.eventsTab();
    const map = mapEventColumns(tab?.headers ?? []);

    if (!prev) {
      const e = { ...draft, id: newEventId(), createdBy: user, updatedAt };
      // RAW append: every value is stored as literal text.
      await this.append(EVENTS_TAB, [eventToRow(e, map, false)], "events");
      await this.log([{ action: "Crear evento", postId: e.id, field: "", oldValue: "", newValue: e.title }], user);
      return { ...e, key: e.id, rowHint: 0, snapshot: eventFingerprint(e) };
    }

    if (!tab || map.id === undefined) throw new Error("No se encontró la pestaña APP_EVENTOS.");
    const q = quoteSheet(tab.title);
    const idCol = columnLetter(map.id);
    const [ids] = await this.t.batchGet([`${q}!${idCol}:${idCol}`]);
    const idx = ids.findIndex((r) => String(r[0] ?? "").trim().replace(/^'/, "") === prev.id);
    if (idx < 1) throw new Error(`No se encontró el evento ${prev.id} en el Sheet (¿fue borrado?).`);
    const row = idx + 1;
    const rowRange = `${q}!A${row}:${columnLetter(tab.headers.length - 1)}${row}`;

    const [before] = await this.t.batchGet([rowRange]);
    if (rowToEvent((before[0] ?? []) as Cell[], row, map)?.snapshot !== prev.snapshot) throw new Error(EVENT_CONFLICT);

    const e = { ...draft, id: prev.id, createdBy: prev.createdBy, updatedAt };
    const values = eventToRow(e, map, true);
    // One range per known column, so columns added by hand in the tab are never touched.
    await this.t.batchUpdate(
      Object.values(map).map((col) => ({ range: `${q}!${columnLetter(col!)}${row}`, values: [[values[col!]]] })),
    );

    const [after] = await this.t.batchGet([rowRange]);
    const saved = rowToEvent((after[0] ?? []) as Cell[], row, map);
    if (!saved || saved.snapshot !== eventFingerprint(e)) throw new Error("No se pudo confirmar la escritura en Google Sheets.");
    await this.log([{ action: "Editar evento", postId: e.id, field: "", oldValue: "", newValue: e.title }], user);
    return saved;
  }
}

/** Reads ⚙️ CONFIGURACIÓN by header name (its columns have gaps between lists). */
export function parseConfig(rows: Cell[][], posts: Post[]): Lists {
  const headers = (rows[0] ?? []).map((h) => normalizeHeader(String(h ?? "")));
  const col = (name: string) => headers.findIndex((h) => h === name || h.startsWith(name));
  const values = (name: string) => {
    const c = col(name);
    if (c < 0) return [];
    return rows.slice(1).map((r) => String(r[c] ?? "").trim()).filter(Boolean);
  };
  const cBrand = col("marcas");
  const cEmoji = col("emoji");
  const cColor = col("color");
  const cState = col("estados");
  const cPending = col("cuenta como pendiente");

  const brands = rows
    .slice(1)
    .filter((r) => cBrand >= 0 && String(r[cBrand] ?? "").trim())
    .map((r) => ({
      name: String(r[cBrand]).trim(),
      emoji: cEmoji >= 0 ? String(r[cEmoji] ?? "") : "",
      color: cColor >= 0 && String(r[cColor] ?? "").startsWith("#") ? String(r[cColor]) : "#64748b",
    }));
  const statuses = rows
    .slice(1)
    .filter((r) => cState >= 0 && String(r[cState] ?? "").trim())
    .map((r) => ({
      name: String(r[cState]).trim(),
      countsAsPending: cPending >= 0 ? /^s/i.test(String(r[cPending] ?? "")) : !/publicado|cancelado|aprobado|programado/i.test(String(r[cState])),
    }));

  const uniq = (a: string[]) => [...new Set(a.filter(Boolean))];
  const fromPosts = (k: "brand" | "platform" | "type" | "priority" | "owner") => posts.map((p) => p[k]);

  // Values that appear in posts but not in the config lists are added at the end, so nothing is hidden.
  for (const b of uniq(fromPosts("brand"))) if (!brands.some((x) => x.name === b)) brands.push({ name: b, emoji: "", color: "#64748b" });
  for (const s of uniq(posts.map((p) => p.status))) if (!statuses.some((x) => x.name === s)) statuses.push({ name: s, countsAsPending: true });

  return {
    brands,
    statuses,
    platforms: uniq([...values("plataformas"), ...fromPosts("platform")]),
    types: uniq([...values("tipos"), ...fromPosts("type")]),
    priorities: uniq([...values("prioridades"), ...fromPosts("priority")]),
    owners: uniq([...values("responsables"), ...fromPosts("owner")]),
  };
}
