// Pure calculations over the real posts: filters, alerts, dashboard counts, stats.
import { addDays, startOfWeek, todayISO } from "./dates";
import type { Lists, Post } from "./types";

export const isPublished = (p: Post) => /^publicad/i.test(p.status);
export const isClosed = (p: Post) => /^(publicad|cancelad)/i.test(p.status);
export const isReview = (p: Post) => /^revis/i.test(p.status);
export const isInProduction = (p: Post) => /producci/i.test(p.status);

export function isPending(p: Post, lists: Lists): boolean {
  if (!p.status) return true;
  const s = lists.statuses.find((x) => x.name === p.status);
  return s ? s.countsAsPending : !isClosed(p);
}

export function sortByDateTime(a: Post, b: Post): number {
  const ka = `${a.date ?? "9999"} ${a.time ?? "99"}`;
  const kb = `${b.date ?? "9999"} ${b.time ?? "99"}`;
  return ka.localeCompare(kb);
}

export interface Filters {
  q: string;
  brand: string;
  status: string;
  owner: string;
  platform: string;
  type: string;
  priority: string;
  sponsor: string;
  from: string;
  to: string;
  includeArchive: boolean;
}

export const EMPTY_FILTERS: Filters = {
  q: "", brand: "", status: "", owner: "", platform: "", type: "", priority: "", sponsor: "", from: "", to: "", includeArchive: true,
};

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function applyFilters(posts: Post[], f: Filters): Post[] {
  const q = fold(f.q.trim());
  return posts.filter((p) => {
    if (!f.includeArchive && p.source === "historico") return false;
    if (f.brand && p.brand !== f.brand) return false;
    if (f.status && (p.status || "(sin estado)") !== f.status) return false;
    if (f.owner && (p.owner || "(sin responsable)") !== f.owner) return false;
    if (f.platform && p.platform !== f.platform) return false;
    if (f.type && p.type !== f.type) return false;
    if (f.priority && p.priority !== f.priority) return false;
    if (f.sponsor && !p.sponsors.includes(f.sponsor)) return false;
    if (f.from && (!p.date || p.date < f.from)) return false;
    if (f.to && (!p.date || p.date > f.to)) return false;
    if (q) {
      const hay = fold([p.id, p.title, p.copy, p.notes, p.brand, p.owner, p.type, p.platform, p.sponsors.join(" "), ...Object.values(p.extra)].join(" "));
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function brandSummary(posts: Post[], brand: string, from: string, to: string) {
  const list = posts.filter((p) => p.brand === brand && p.date && p.date >= from && p.date <= to);
  return {
    total: list.length,
    published: list.filter(isPublished).length,
    pending: list.filter((p) => !isClosed(p) && !isReview(p) && !isInProduction(p)).length,
    production: list.filter(isInProduction).length,
    review: list.filter(isReview).length,
  };
}

export type AlertKind = "overdue" | "noOwner" | "noDate" | "review" | "upcoming";

export const ALERT_META: Record<AlertKind, { icon: string; label: string }> = {
  overdue: { icon: "🔴", label: "Atrasadas" },
  noOwner: { icon: "🟠", label: "Sin responsable" },
  noDate: { icon: "🟡", label: "Sin fecha" },
  review: { icon: "🔵", label: "Pendientes de revisión" },
  upcoming: { icon: "🟣", label: "Próximas a publicar (48 h)" },
};

export function computeAlerts(posts: Post[], today = todayISO()): Record<AlertKind, Post[]> {
  const open = posts.filter((p) => !isClosed(p));
  const soon = addDays(today, 2);
  return {
    overdue: open.filter((p) => p.date && p.date < today).sort(sortByDateTime),
    noOwner: open.filter((p) => !p.owner),
    noDate: open.filter((p) => !p.date),
    review: open.filter(isReview).sort(sortByDateTime),
    upcoming: open.filter((p) => p.date && p.date >= today && p.date <= soon).sort(sortByDateTime),
  };
}

export function countBy(posts: Post[], key: (p: Post) => string | string[]): [string, number][] {
  const m = new Map<string, number>();
  for (const p of posts) {
    const k = key(p);
    for (const v of Array.isArray(k) ? k : [k]) m.set(v || "(vacío)", (m.get(v || "(vacío)") ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export type TaskBucket = "Atrasadas" | "Hoy" | "Mañana" | "Esta semana" | "Próximamente" | "Sin fecha";

export function taskBuckets(posts: Post[], today = todayISO()): Record<TaskBucket, Post[]> {
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(startOfWeek(today), 6);
  const out: Record<TaskBucket, Post[]> = { Atrasadas: [], Hoy: [], Mañana: [], "Esta semana": [], Próximamente: [], "Sin fecha": [] };
  for (const p of [...posts].sort(sortByDateTime)) {
    if (isClosed(p)) continue;
    if (!p.date) out["Sin fecha"].push(p);
    else if (p.date < today) out.Atrasadas.push(p);
    else if (p.date === today) out.Hoy.push(p);
    else if (p.date === tomorrow) out.Mañana.push(p);
    else if (p.date <= weekEnd) out["Esta semana"].push(p);
    else out.Próximamente.push(p);
  }
  return out;
}

/** Matches a Google account with a "Responsable" value (names or emails). */
export function guessOwner(owners: string[], email: string, name: string): string {
  const e = email.toLowerCase();
  const n = fold(name);
  return (
    owners.find((o) => o.toLowerCase() === e) ??
    owners.find((o) => n && fold(o).split(/\s+/).includes(n.split(/\s+/)[0])) ??
    ""
  );
}

const STATUS_COLORS: [RegExp, string][] = [
  [/^idea/i, "#94a3b8"],
  [/^pendiente/i, "#f59e0b"],
  [/producci/i, "#3b82f6"],
  [/^dise/i, "#6366f1"],
  [/^revis/i, "#eab308"],
  [/^aprob/i, "#14b8a6"],
  [/^program/i, "#06b6d4"],
  [/^publicad/i, "#22c55e"],
  [/^cancel/i, "#ef4444"],
];

export function statusColor(status: string): string {
  return STATUS_COLORS.find(([re]) => re.test(status))?.[1] ?? "#64748b";
}
