"use client";

import { useMemo, useState } from "react";
import { useFiltered } from "@/components/Filters";
import { Button, Card, Empty, PageHeader, PostCard } from "@/components/ui";
import { addDays, formatDate, formatDateLong, startOfWeek, todayISO } from "@/lib/dates";
import { ALERT_META, brandSummary, computeAlerts, isPublished, sortByDateTime, type AlertKind } from "@/lib/insights";
import { useStore } from "@/lib/store";

export default function Home() {
  const { lists, update } = useStore();
  const posts = useFiltered();
  const today = todayISO();
  const weekStart = startOfWeek(today);
  const weekEnd = addDays(weekStart, 6);
  const todays = useMemo(() => posts.filter((p) => p.date === today).sort(sortByDateTime), [posts, today]);
  const alerts = useMemo(() => computeAlerts(posts, today), [posts, today]);
  const [openAlert, setOpenAlert] = useState<AlertKind | null>(null);
  const pub = lists.statuses.find((s) => /^publicad/i.test(s.name))?.name ?? "Publicado";

  return (
    <>
      <PageHeader title="Inicio" subtitle={`${formatDateLong(today)} · semana del ${formatDate(weekStart)} al ${formatDate(weekEnd)}`} />

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Publicaciones de esta semana</h2>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {lists.brands.map((b) => {
          const s = brandSummary(posts, b.name, weekStart, weekEnd);
          return (
            <Card key={b.name} className="overflow-hidden">
              <div className="h-1" style={{ background: b.color }} />
              <div className="p-4">
                <div className="flex items-baseline justify-between">
                  <div className="font-semibold">{b.emoji} {b.name}</div>
                  <div className="text-2xl font-bold">{s.total}</div>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                  {[["Publicadas", s.published], ["Pendientes", s.pending], ["Producción", s.production], ["Revisar", s.review]].map(([l, n]) => (
                    <div key={l} className="rounded-lg bg-panel-2 py-2">
                      <div className="text-base font-semibold">{n}</div>
                      <div className="text-muted">{l}</div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Hoy · {todays.length}</h2>
          <div className="space-y-2">
            {todays.length === 0 && <Empty>No hay publicaciones con fecha de hoy en el Sheet.</Empty>}
            {todays.map((p) => (
              <PostCard
                key={p.key}
                post={p}
                action={
                  !isPublished(p) && (
                    <Button variant="outline" className="!px-2 !py-1 text-xs" onClick={() => update(p, { status: pub })}>
                      ✓ Publicado
                    </Button>
                  )
                }
              />
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Alertas</h2>
          <Card className="divide-y divide-line">
            {(Object.keys(ALERT_META) as AlertKind[]).map((k) => (
              <div key={k}>
                <button className="flex w-full items-center justify-between px-4 py-3 text-sm hover:bg-panel-2" onClick={() => setOpenAlert(openAlert === k ? null : k)}>
                  <span>{ALERT_META[k].icon} {ALERT_META[k].label}</span>
                  <span className="rounded-full bg-panel-2 px-2 text-xs font-semibold">{alerts[k].length}</span>
                </button>
                {openAlert === k && (
                  <div className="space-y-1.5 px-3 pb-3">
                    {alerts[k].slice(0, 30).map((p) => <PostCard key={p.key} post={p} showDate />)}
                    {alerts[k].length === 0 && <p className="px-1 text-xs text-muted">Nada por acá 👌</p>}
                  </div>
                )}
              </div>
            ))}
          </Card>
        </section>
      </div>
    </>
  );
}
