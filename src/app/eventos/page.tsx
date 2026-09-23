"use client";

import { useMemo, useState } from "react";
import { EventCard } from "@/components/EventCard";
import { downloadICS } from "@/components/EventModal";
import { Button, Card, Empty, PageHeader, Select } from "@/components/ui";
import { addDays, startOfWeek, todayISO } from "@/lib/dates";
import { isCancelled, isGoing, sortEvents, type TeamEvent } from "@/lib/events";
import { useStore } from "@/lib/store";

type Group = "Esta semana" | "Próximos" | "Sin fecha" | "Pasados";

export default function EventsPage() {
  const { events, openEvent, me, setMe, lists, workbook, mode, script, toast } = useStore();
  const [onlyMine, setOnlyMine] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const today = todayISO();
  const weekEnd = addDays(startOfWeek(today), 6);

  const visible = useMemo(() => events.filter((e) => !onlyMine || isGoing(e, me)).sort(sortEvents), [events, onlyMine, me]);
  const groups = useMemo(() => {
    const g: Record<Group, TeamEvent[]> = { "Esta semana": [], Próximos: [], "Sin fecha": [], Pasados: [] };
    visible.forEach((e) => {
      if (!e.date) g["Sin fecha"].push(e);
      else if (e.date < today) g.Pasados.push(e);
      else if (e.date <= weekEnd) g["Esta semana"].push(e);
      else g.Próximos.push(e);
    });
    g.Pasados.reverse();
    return g;
  }, [visible, today, weekEnd]);

  // Who is going to how many events in the next 30 days, to spread the load.
  const load = useMemo(() => {
    const until = addDays(today, 30);
    const count = new Map<string, number>(lists.owners.map((o) => [o, 0]));
    events
      .filter((e) => e.date && e.date >= today && e.date <= until && !isCancelled(e))
      .forEach((e) => e.team.forEach((m) => count.set(m.name, (count.get(m.name) ?? 0) + 1)));
    return [...count.entries()].sort((a, b) => b[1] - a[1]);
  }, [events, lists.owners, today]);
  const unstaffed = events.filter((e) => e.date && e.date >= today && !isCancelled(e) && e.team.length === 0).length;

  const feedUrl = mode === "google" && script.url && script.key ? `${script.url}?ics=1&key=${encodeURIComponent(script.key)}` : "";

  return (
    <>
      <PageHeader
        title="Eventos del equipo"
        subtitle="Partidos y coberturas: quién va, cuándo y qué hay que hacer. Se guardan en la pestaña APP_EVENTOS del Sheet."
        actions={
          <>
            <Button variant="outline" onClick={() => downloadICS(events, "grupo22-eventos.ics", workbook?.timeZone)} disabled={!events.length}>
              ⬇ Exportar calendario
            </Button>
            <Button variant="primary" onClick={() => openEvent("new")}>+ Nuevo evento</Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2 text-muted">
          Soy
          <Select className="!w-auto" value={me} onChange={setMe} options={lists.owners} placeholder="Elegí tu nombre" />
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} disabled={!me} />
          Solo donde voy yo
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} />
          Ver pasados ({groups.Pasados.length})
        </label>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_280px]">
        <div className="space-y-6">
          {events.length === 0 && (
            <Empty>
              Todavía no hay eventos. Creá el primero con <b>+ Nuevo evento</b>: la app arma la pestaña APP_EVENTOS en el Sheet.
            </Empty>
          )}
          {(["Esta semana", "Próximos", "Sin fecha", "Pasados"] as Group[])
            .filter((g) => groups[g].length && (g !== "Pasados" || showPast))
            .map((g) => (
              <section key={g}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{g} · {groups[g].length}</h2>
                <div className="space-y-2">
                  {groups[g].map((e) => <EventCard key={e.key} event={e} />)}
                </div>
              </section>
            ))}
        </div>

        <aside className="space-y-4">
          <Card className="p-4">
            <h3 className="mb-1 text-sm font-semibold">Carga del equipo</h3>
            <p className="mb-3 text-xs text-muted">Eventos asignados en los próximos 30 días.</p>
            {unstaffed > 0 && <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">⚠ {unstaffed} evento(s) sin nadie asignado</p>}
            <div className="space-y-1.5">
              {load.map(([name, n]) => (
                <div key={name} className="flex items-center gap-2 text-sm">
                  <span className="w-24 truncate">{name}</span>
                  <div className="h-1.5 flex-1 rounded-full bg-panel-2">
                    <div className="h-1.5 rounded-full bg-accent" style={{ width: `${Math.min(100, n * 20)}%` }} />
                  </div>
                  <span className="w-5 text-right text-xs text-muted">{n}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4 text-sm">
            <h3 className="mb-1 font-semibold">Conectar con Google Calendar</h3>
            {feedUrl ? (
              <>
                <p className="mb-2 text-xs text-muted">
                  Suscribite una vez y los eventos aparecen solos en tu calendario (Google lo actualiza cada algunas horas).
                  En Google Calendar: <b>Otros calendarios → + → Desde URL</b> y pegá:
                </p>
                <div className="flex gap-2">
                  <input className="input font-mono !text-xs" readOnly value={feedUrl} onFocus={(e) => e.target.select()} />
                  <Button variant="outline" onClick={() => navigator.clipboard.writeText(feedUrl).then(() => toast("ok", "Link copiado"))}>
                    Copiar
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted">Requiere la versión nueva del Apps Script (ver README).</p>
              </>
            ) : (
              <p className="text-xs text-muted">
                Cada evento tiene el botón <b>📅 Google Calendar</b> para agregarlo a tu agenda, y arriba podés exportar todos en un .ics.
                Con el puente Apps Script conectado también aparece un link para suscribirse y que se actualice solo.
              </p>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
