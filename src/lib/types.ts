// Canonical field keys. They map to real Sheet headers through src/lib/schema.ts,
// so the UI never depends on column letters.
export type FieldKey =
  | "id"
  | "brand"
  | "date"
  | "day"
  | "month"
  | "year"
  | "week"
  | "time"
  | "platform"
  | "type"
  | "title"
  | "copy"
  | "status"
  | "owner"
  | "priority"
  | "link"
  | "sponsors"
  | "notes"
  | "origin"
  | "startAt"
  | "slot";

/** Fields the user edits. Everything else is derived or technical. */
export const EDITABLE_FIELDS: FieldKey[] = [
  "brand",
  "date",
  "time",
  "platform",
  "type",
  "title",
  "copy",
  "status",
  "owner",
  "priority",
  "link",
  "sponsors",
  "notes",
];

/** Computed from date/time. In 📋 CONTENIDOS they are ARRAYFORMULAs and must never be written. */
export const DERIVED_FIELDS: FieldKey[] = ["day", "month", "year", "week", "startAt", "slot"];

export type PostSource = "contenidos" | "historico";

export interface Post {
  /** Stable key for React/UI: `${source}:${id}` (IDs may repeat across tabs). */
  key: string;
  /** Value of the ID column (e.g. G22-0031). Empty when the row has no ID yet. */
  id: string;
  source: PostSource;
  sheetTitle: string;
  /** 1-based row number where the post was last seen. Only a hint: rows can move. */
  rowHint: number;
  brand: string;
  /** ISO yyyy-mm-dd or null */
  date: string | null;
  /** HH:MM or null */
  time: string | null;
  platform: string;
  type: string;
  title: string;
  copy: string;
  status: string;
  owner: string;
  priority: string;
  link: string;
  sponsors: string[];
  notes: string;
  origin: string;
  /** Columns present in the Sheet that the app does not know about, by header name. */
  extra: Record<string, string>;
  /** Normalized snapshot of every column (by header) at load time, for conflict detection. */
  snapshot: Record<string, string>;
}

export type PostPatch = Partial<
  Pick<
    Post,
    | "brand"
    | "date"
    | "time"
    | "platform"
    | "type"
    | "title"
    | "copy"
    | "status"
    | "owner"
    | "priority"
    | "link"
    | "sponsors"
    | "notes"
  >
>;

export interface Brand {
  name: string;
  emoji: string;
  color: string;
}

export interface StatusDef {
  name: string;
  countsAsPending: boolean;
}

export interface Lists {
  brands: Brand[];
  platforms: string[];
  types: string[];
  statuses: StatusDef[];
  priorities: string[];
  owners: string[];
}

export interface HistoryEntry {
  timestamp: string;
  user: string;
  postId: string;
  action: string;
  field: string;
  oldValue: string;
  newValue: string;
}

export interface CommentEntry {
  timestamp: string;
  user: string;
  postId: string;
  text: string;
}

export interface Attachment {
  timestamp: string;
  user: string;
  postId: string;
  fileId: string;
  name: string;
  mimeType: string;
  url: string;
}

export interface SheetInfo {
  sheetId: number;
  title: string;
  index: number;
  hidden: boolean;
  role: SheetRole;
  headers: string[];
}

export type SheetRole =
  | "posts"
  | "archive"
  | "config"
  | "history"
  | "comments"
  | "attachments"
  | "view"
  | "backup"
  | "unknown";

export interface WorkbookMap {
  spreadsheetId: string;
  title: string;
  locale: string;
  timeZone: string;
  sheets: SheetInfo[];
  postsSheet: string | null;
  archiveSheet: string | null;
  configSheet: string | null;
  analyzedAt: string;
}

export type SyncState = "idle" | "syncing" | "ok" | "error" | "offline";

export class ConflictError extends Error {
  constructor(
    public postId: string,
    public changedFields: string[],
  ) {
    super("Esta publicación fue modificada por otro usuario. Actualizá los datos antes de guardar.");
    this.name = "ConflictError";
  }
}
