import type { FieldKey } from "./types";

/** Lowercase, strip accents, emojis and punctuation: "Tema / Título" → "tema titulo". */
export function normalizeHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Aliases are matched against normalized headers. The first entries are the real
// headers of 📋 CONTENIDOS; the rest are tolerated variants (the original per-brand
// sheets used "Contenido", "Propietario", "Fecha de publicación", etc.).
const ALIASES: Record<FieldKey, string[]> = {
  id: ["id", "post id", "post_id", "codigo"],
  brand: ["marca", "marcas del grupo", "cuenta"],
  date: ["fecha", "fecha de publicacion", "fecha publicacion"],
  day: ["dia"],
  month: ["mes"],
  year: ["ano", "año"],
  week: ["semana"],
  time: ["hora", "horario"],
  platform: ["plataforma", "plataformas", "red social"],
  type: ["tipo", "formato"],
  title: ["tema titulo", "titulo", "tema", "contenido"],
  copy: ["copy", "detalles cop s", "texto"],
  status: ["estado"],
  owner: ["responsable", "propietario", "asignado"],
  priority: ["prioridad"],
  link: ["link asset", "link", "archivo links", "asset"],
  sponsors: ["sponsors", "sponsor"],
  notes: ["observaciones", "notas", "comentarios"],
  origin: ["origen"],
  startAt: ["inicio fecha hora", "inicio"],
  slot: ["franja horaria", "franja"],
};

export type ColumnMap = Partial<Record<FieldKey, number>>;

/** Maps canonical fields to 0-based column indexes. Each column is used once. */
export function mapColumns(headers: string[]): ColumnMap {
  const norm = headers.map((h) => normalizeHeader(h ?? ""));
  const used = new Set<number>();
  const map: ColumnMap = {};
  (Object.keys(ALIASES) as FieldKey[]).forEach((key) => {
    for (const alias of ALIASES[key]) {
      const idx = norm.findIndex((h, i) => !used.has(i) && h === normalizeHeader(alias));
      if (idx >= 0) {
        map[key] = idx;
        used.add(idx);
        return;
      }
    }
  });
  return map;
}

/** A tab holds posts when it has at least an ID, a title and a status column. */
export function looksLikePostsTable(headers: string[]): boolean {
  const m = mapColumns(headers);
  return m.id !== undefined && m.title !== undefined && m.status !== undefined;
}

export function columnLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Quotes a sheet title for A1 notation: 📋 CONTENIDOS → '📋 CONTENIDOS'. */
export function quoteSheet(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

export const FIELD_LABELS: Record<FieldKey, string> = {
  id: "ID",
  brand: "Marca",
  date: "Fecha",
  day: "Día",
  month: "Mes",
  year: "Año",
  week: "Semana",
  time: "Hora",
  platform: "Plataforma",
  type: "Tipo",
  title: "Tema / Título",
  copy: "Copy",
  status: "Estado",
  owner: "Responsable",
  priority: "Prioridad",
  link: "Link / Asset",
  sponsors: "Sponsors",
  notes: "Observaciones",
  origin: "Origen",
  startAt: "Inicio (fecha + hora)",
  slot: "Franja horaria",
};

// Technical tabs the app may create. They never alter the existing ones.
export const APP_TABS = {
  history: { title: "APP_HISTORIAL", headers: ["Timestamp", "Usuario", "post_id", "Acción", "Campo", "Valor anterior", "Valor nuevo"] },
  comments: { title: "APP_COMENTARIOS", headers: ["Timestamp", "Usuario", "post_id", "Comentario"] },
  attachments: {
    title: "APP_ADJUNTOS",
    headers: ["Timestamp", "Usuario", "post_id", "file_id", "Nombre", "Tipo", "URL"],
  },
} as const;
