"use client";

import { useMemo, useState } from "react";
import { FiltersBar, useFiltered } from "@/components/Filters";
import { Card, Empty, PageHeader, PostCard } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { useStore } from "@/lib/store";

export default function SponsorsPage() {
  const { lists } = useStore();
  const posts = useFiltered();
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(() => {
    const m = new Map<string, typeof posts>();
    posts.forEach((p) => p.sponsors.forEach((s) => m.set(s, [...(m.get(s) ?? []), p])));
    return [...m.entries()]
      .map(([name, list]) => {
        const dates = list.map((p) => p.date).filter(Boolean).sort() as string[];
        return { name, list, from: dates[0], to: dates[dates.length - 1] };
      })
      .sort((a, b) => b.list.length - a.list.length);
  }, [posts]);

  return (
    <>
      <PageHeader title="Sponsors" subtitle="Apariciones por sponsor, según la columna Sponsors del Sheet." />
      <FiltersBar show={["brand", "dates", "archive"]} />
      {rows.length === 0 && <Empty>No hay publicaciones con sponsors en el filtro actual.</Empty>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => (
          <Card key={r.name} className="p-4">
            <button className="w-full text-left" onClick={() => setOpen(open === r.name ? null : r.name)}>
              <div className="flex items-baseline justify-between">
                <div className="font-semibold">{r.name}</div>
                <div className="text-2xl font-bold">{r.list.length}</div>
              </div>
              <div className="text-xs text-muted">apariciones{r.from ? ` · ${formatDate(r.from)} – ${formatDate(r.to)}` : " · sin fechas"}</div>
              <div className="mt-3 space-y-1">
                {lists.brands.map((b) => {
                  const n = r.list.filter((p) => p.brand === b.name).length;
                  return n ? (
                    <div key={b.name} className="flex justify-between text-sm">
                      <span style={{ color: b.color }}>{b.emoji} {b.name}</span>
                      <b>{n}</b>
                    </div>
                  ) : null;
                })}
              </div>
            </button>
            {open === r.name && <div className="mt-3 space-y-1.5">{r.list.map((p) => <PostCard key={p.key} post={p} showDate />)}</div>}
          </Card>
        ))}
      </div>
    </>
  );
}
