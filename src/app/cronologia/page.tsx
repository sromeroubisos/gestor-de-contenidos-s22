"use client";

import { useEffect, useState } from "react";
import { FiltersBar, useFiltered } from "@/components/Filters";
import { Button, Card, PageHeader, PostCard } from "@/components/ui";
import { addDays, formatDate, isoWeek, startOfWeek, todayISO } from "@/lib/dates";
import { sortByDateTime } from "@/lib/insights";
import { useStore } from "@/lib/store";
import type { HistoryEntry } from "@/lib/types";

const WEEKS = 8;

export default function TimelinePage() {
  const { lists, provider, sync } = useStore();
  const posts = useFiltered();
  const [from, setFrom] = useState(startOfWeek(todayISO()));
  const [activity, setActivity] = useState<HistoryEntry[]>([]);
  const weeks = Array.from({ length: WEEKS }, (_, i) => addDays(from, i * 7));
  const thisWeek = startOfWeek(todayISO());

  useEffect(() => {
    provider.getHistory().then((h) => setActivity(h.slice(0, 40))).catch(() => setActivity([]));
  }, [provider, sync.lastSync]);

  return (
    <>
      <PageHeader
        title="Cronología"
        subtitle="Línea de tiempo por marca, semana a semana."
        actions={
          <>
            <Button variant="outline" onClick={() => setFrom(addDays(from, -7 * WEEKS))}>‹</Button>
            <Button variant="outline" onClick={() => setFrom(thisWeek)}>Esta semana</Button>
            <Button variant="outline" onClick={() => setFrom(addDays(from, 7 * WEEKS))}>›</Button>
          </>
        }
      />
      <FiltersBar show={["owner", "status", "archive"]} />
      <div className="overflow-x-auto pb-2">
        <div className="grid min-w-[1100px] gap-px overflow-hidden rounded-xl border border-line bg-[color:var(--line)]" style={{ gridTemplateColumns: `160px repeat(${WEEKS}, 1fr)` }}>
          <div className="bg-panel-2 p-2 text-xs font-semibold text-muted">Marca</div>
          {weeks.map((w) => (
            <div key={w} className={`bg-panel-2 p-2 text-xs font-semibold ${w === thisWeek ? "text-accent" : "text-muted"}`}>
              Sem {isoWeek(w)} · {formatDate(w).slice(0, 5)}
            </div>
          ))}
          {lists.brands.map((b) => (
            <div key={b.name} className="contents">
              <div className="bg-panel p-2 text-sm font-semibold" style={{ color: b.color }}>{b.emoji} {b.name}</div>
              {weeks.map((w) => {
                const items = posts.filter((p) => p.brand === b.name && p.date && p.date >= w && p.date <= addDays(w, 6)).sort(sortByDateTime);
                return (
                  <div key={w} className={`space-y-1 bg-panel p-1.5 ${w === thisWeek ? "bg-accent/5" : ""}`}>
                    {items.map((p) => <PostCard key={p.key} post={p} compact />)}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <h2 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wider text-muted">Actividad reciente (APP_HISTORIAL)</h2>
      <Card className="divide-y divide-line">
        {activity.length === 0 && <p className="p-4 text-sm text-muted">Todavía no hay cambios registrados desde la app.</p>}
        {activity.map((h, i) => (
          <div key={i} className="px-4 py-2 text-sm">
            <span className="text-xs text-muted">{h.timestamp} · {h.user} · {h.postId}</span>
            <div>{h.action} {h.field && <b>{h.field}</b>} {h.field ? `${h.oldValue || "∅"} → ${h.newValue || "∅"}` : h.newValue}</div>
          </div>
        ))}
      </Card>
    </>
  );
}
