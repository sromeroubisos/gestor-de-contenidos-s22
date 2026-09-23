"use client";

import { useMemo } from "react";
import { applyFilters, EMPTY_FILTERS, type Filters } from "@/lib/insights";
import { useStore } from "@/lib/store";
import { Button, Select } from "./ui";

type Key = "brand" | "status" | "owner" | "platform" | "type" | "priority" | "sponsor" | "dates" | "archive";

/** Filter bar bound to the global filters. `show` picks which controls appear. */
export function FiltersBar({ show = ["brand", "owner", "status", "platform"] }: { show?: Key[] }) {
  const { filters, setFilters, lists, posts } = useStore();
  const sponsors = useMemo(() => [...new Set(posts.flatMap((p) => p.sponsors))].sort(), [posts]);
  const has = (k: Key) => show.includes(k);
  const active = (Object.keys(EMPTY_FILTERS) as (keyof Filters)[]).some((k) => k !== "q" && filters[k] !== EMPTY_FILTERS[k]);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {has("brand") && (
        <div className="flex flex-wrap gap-1">
          <Chip on={!filters.brand} onClick={() => setFilters({ brand: "" })}>Todas</Chip>
          {lists.brands.map((b) => (
            <Chip key={b.name} on={filters.brand === b.name} color={b.color} onClick={() => setFilters({ brand: filters.brand === b.name ? "" : b.name })}>
              {b.emoji} {b.name}
            </Chip>
          ))}
        </div>
      )}
      {has("owner") && <Select className="!w-auto" value={filters.owner} onChange={(v) => setFilters({ owner: v })} options={[...lists.owners, "(sin responsable)"]} placeholder="Responsable" />}
      {has("status") && <Select className="!w-auto" value={filters.status} onChange={(v) => setFilters({ status: v })} options={[...lists.statuses.map((s) => s.name), "(sin estado)"]} placeholder="Estado" />}
      {has("platform") && <Select className="!w-auto" value={filters.platform} onChange={(v) => setFilters({ platform: v })} options={lists.platforms} placeholder="Plataforma" />}
      {has("type") && <Select className="!w-auto" value={filters.type} onChange={(v) => setFilters({ type: v })} options={lists.types} placeholder="Tipo" />}
      {has("priority") && <Select className="!w-auto" value={filters.priority} onChange={(v) => setFilters({ priority: v })} options={lists.priorities} placeholder="Prioridad" />}
      {has("sponsor") && <Select className="!w-auto" value={filters.sponsor} onChange={(v) => setFilters({ sponsor: v })} options={sponsors} placeholder="Sponsor" />}
      {has("dates") && (
        <>
          <input type="date" className="input !w-auto" value={filters.from} onChange={(e) => setFilters({ from: e.target.value })} title="Desde" />
          <input type="date" className="input !w-auto" value={filters.to} onChange={(e) => setFilters({ to: e.target.value })} title="Hasta" />
        </>
      )}
      {has("archive") && (
        <label className="flex items-center gap-1.5 text-sm text-muted">
          <input type="checkbox" checked={filters.includeArchive} onChange={(e) => setFilters({ includeArchive: e.target.checked })} />
          Incluir 🗄️ Histórico
        </label>
      )}
      {active && <Button onClick={() => setFilters({ ...EMPTY_FILTERS, q: filters.q })}>Limpiar filtros</Button>}
    </div>
  );
}

function Chip({ on, color, onClick, children }: { on: boolean; color?: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${on ? "border-transparent text-white" : "border-line text-muted hover:text-fg"}`}
      style={on ? { background: color ?? "var(--accent)" } : undefined}
    >
      {children}
    </button>
  );
}

export function useFiltered() {
  const { posts, filters } = useStore();
  return useMemo(() => applyFilters(posts, filters), [posts, filters]);
}
