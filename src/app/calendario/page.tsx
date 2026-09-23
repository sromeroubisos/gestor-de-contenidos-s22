"use client";

import { useMemo, useState, type ReactNode } from "react";
import { FiltersBar, useFiltered } from "@/components/Filters";
import { Button, Card, PageHeader, PostCard } from "@/components/ui";
import { addDays, DAY_NAMES, formatDateLong, fromISO, MONTH_NAMES, startOfWeek, toISO, todayISO } from "@/lib/dates";
import { EVENT_ICON, isCancelled, sortEvents, type TeamEvent } from "@/lib/events";
import { sortByDateTime } from "@/lib/insights";
import { useStore } from "@/lib/store";
import type { Post, PostPatch } from "@/lib/types";

type View = "mes" | "semana" | "dia";

/** Team event in the calendar: dashed and not draggable, so it reads apart from posts. Opens the event editor. */
function EventChip({ event: e, compact = false }: { event: TeamEvent; compact?: boolean }) {
  const { openEvent } = useStore();
  return (
    <button
      onClick={() => openEvent(e.key)}
      className={`block w-full truncate rounded-lg border border-dashed border-accent/60 bg-accent/10 text-left font-medium hover:bg-accent/20 ${compact ? "px-2 py-1 text-xs" : "p-2.5 text-sm"} ${isCancelled(e) ? "line-through opacity-50" : ""}`}
      title={e.team.map((m) => m.name).join(", ") || "Nadie asignado"}
    >
      <span className="text-muted">{e.time ?? ""}</span> {EVENT_ICON[e.type] ?? "📌"} {e.title}
      {!compact && e.team.length > 0 && <span className="ml-1 text-xs font-normal text-muted">· {e.team.map((m) => m.name).join(", ")}</span>}
    </button>
  );
}

function DropZone({ onDrop, className = "", children }: { onDrop: (key: string) => void; className?: string; children: ReactNode }) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={`${className} ${over ? "drop-target" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const key = e.dataTransfer.getData("text/plain");
        if (key) onDrop(key);
      }}
    >
      {children}
    </div>
  );
}

export default function CalendarPage() {
  const { posts: all, update, events, openEvent } = useStore();
  const posts = useFiltered();
  const [view, setView] = useState<View>("mes");
  const [cursor, setCursor] = useState(todayISO());
  const today = todayISO();

  const byDate = useMemo(() => {
    const m = new Map<string, Post[]>();
    posts.filter((p) => p.date).sort(sortByDateTime).forEach((p) => m.set(p.date!, [...(m.get(p.date!) ?? []), p]));
    return m;
  }, [posts]);
  const eventsByDate = useMemo(() => {
    const m = new Map<string, TeamEvent[]>();
    events.filter((e) => e.date).sort(sortEvents).forEach((e) => m.set(e.date!, [...(m.get(e.date!) ?? []), e]));
    return m;
  }, [events]);
  const undated = posts.filter((p) => !p.date && !/^(publicad|cancelad)/i.test(p.status));

  const move = (key: string, patch: PostPatch) => {
    const p = all.find((x) => x.key === key);
    if (!p) return;
    if (p.date === patch.date && (patch.time === undefined || p.time === patch.time)) return;
    update(p, patch);
  };

  const d = fromISO(cursor);
  const step = (n: number) => {
    if (view === "mes") setCursor(toISO(new Date(d.getFullYear(), d.getMonth() + n, 1)));
    else setCursor(addDays(cursor, view === "semana" ? 7 * n : n));
  };
  const title =
    view === "mes"
      ? `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`
      : view === "semana"
        ? `Semana del ${formatDateLong(startOfWeek(cursor))}`
        : formatDateLong(cursor);

  return (
    <>
      <PageHeader
        title="Calendario"
        subtitle="Arrastrá una publicación para cambiar su fecha (u hora en vista Día). Los eventos del equipo se ven con borde punteado."
        actions={
          <>
            <div className="flex rounded-lg border border-line p-0.5">
              {(["mes", "semana", "dia"] as View[]).map((v) => (
                <button key={v} onClick={() => setView(v)} className={`rounded-md px-3 py-1 text-sm capitalize ${view === v ? "bg-panel-2 font-semibold" : "text-muted"}`}>
                  {v === "dia" ? "Día" : v}
                </button>
              ))}
            </div>
            <Button variant="outline" onClick={() => step(-1)}>‹</Button>
            <Button variant="outline" onClick={() => setCursor(today)}>Hoy</Button>
            <Button variant="outline" onClick={() => step(1)}>›</Button>
            <Button variant="outline" onClick={() => openEvent("new", { date: view === "mes" ? null : cursor })}>+ Evento</Button>
          </>
        }
      />
      <FiltersBar show={["brand", "owner", "status", "platform", "archive"]} />
      <h2 className="mb-3 text-base font-semibold">{title}</h2>

      <div className="grid gap-4 xl:grid-cols-[1fr_260px]">
        <div className="min-w-0">
          {view === "mes" && <MonthGrid cursor={cursor} today={today} byDate={byDate} eventsByDate={eventsByDate} move={move} onDay={(iso) => { setCursor(iso); setView("dia"); }} />}
          {view === "semana" && (
            <div className="grid gap-2 overflow-x-auto md:grid-cols-7">
              {Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i)).map((iso) => (
                <DropZone key={iso} onDrop={(k) => move(k, { date: iso })} className="min-h-40 rounded-xl border border-line bg-panel p-2">
                  <div className={`mb-2 text-xs font-semibold ${iso === today ? "text-accent" : "text-muted"}`}>
                    {DAY_NAMES[(fromISO(iso).getDay() + 6) % 7]} {fromISO(iso).getDate()}
                  </div>
                  <div className="space-y-1.5">
                    {(eventsByDate.get(iso) ?? []).map((e) => <EventChip key={e.key} event={e} compact />)}
                    {(byDate.get(iso) ?? []).map((p) => <PostCard key={p.key} post={p} draggable />)}
                  </div>
                </DropZone>
              ))}
            </div>
          )}
          {view === "dia" && (
            <Card className="divide-y divide-line">
              <DropZone onDrop={(k) => move(k, { date: cursor, time: null })} className="flex gap-3 p-2">
                <div className="w-14 shrink-0 pt-1 text-xs text-muted">Sin hora</div>
                <div className="flex-1 space-y-1.5">
                  {(eventsByDate.get(cursor) ?? []).filter((e) => !e.time).map((e) => <EventChip key={e.key} event={e} />)}
                  {(byDate.get(cursor) ?? []).filter((p) => !p.time).map((p) => <PostCard key={p.key} post={p} draggable />)}
                </div>
              </DropZone>
              {Array.from({ length: 18 }, (_, i) => i + 6).map((h) => {
                const hh = String(h).padStart(2, "0");
                return (
                  <DropZone key={h} onDrop={(k) => move(k, { date: cursor, time: `${hh}:00` })} className="flex min-h-12 gap-3 p-2">
                    <div className="w-14 shrink-0 pt-1 text-xs text-muted">{hh}:00</div>
                    <div className="flex-1 space-y-1.5">
                      {(eventsByDate.get(cursor) ?? []).filter((e) => e.time?.startsWith(hh)).map((e) => <EventChip key={e.key} event={e} />)}
                      {(byDate.get(cursor) ?? []).filter((p) => p.time?.startsWith(hh)).map((p) => <PostCard key={p.key} post={p} draggable />)}
                    </div>
                  </DropZone>
                );
              })}
            </Card>
          )}
        </div>

        <aside>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Sin fecha · {undated.length}</h3>
          <p className="mb-2 text-xs text-muted">Arrastralas al calendario para programarlas.</p>
          <div className="max-h-[70vh] space-y-1.5 overflow-y-auto">
            {undated.map((p) => <PostCard key={p.key} post={p} draggable />)}
          </div>
        </aside>
      </div>
    </>
  );
}

function MonthGrid({ cursor, today, byDate, eventsByDate, move, onDay }: {
  cursor: string; today: string; byDate: Map<string, Post[]>; eventsByDate: Map<string, TeamEvent[]>;
  move: (k: string, p: PostPatch) => void; onDay: (iso: string) => void;
}) {
  const d = fromISO(cursor);
  const first = toISO(new Date(d.getFullYear(), d.getMonth(), 1));
  const start = startOfWeek(first);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[700px] grid-cols-7 gap-px overflow-hidden rounded-xl border border-line bg-[color:var(--line)]">
        {DAY_NAMES.map((n) => (
          <div key={n} className="bg-panel-2 px-2 py-1.5 text-center text-xs font-semibold text-muted">{n.slice(0, 3)}</div>
        ))}
        {days.map((iso) => {
          const inMonth = fromISO(iso).getMonth() === d.getMonth();
          const items = byDate.get(iso) ?? [];
          const evs = eventsByDate.get(iso) ?? [];
          const room = Math.max(0, 4 - evs.length);
          return (
            <DropZone key={iso} onDrop={(k) => move(k, { date: iso })} className={`min-h-28 bg-panel p-1.5 ${inMonth ? "" : "opacity-45"}`}>
              <button onClick={() => onDay(iso)} className={`mb-1 inline-flex size-6 items-center justify-center rounded-full text-xs ${iso === today ? "bg-accent font-bold text-white" : "text-muted hover:bg-panel-2"}`}>
                {fromISO(iso).getDate()}
              </button>
              <div className="space-y-1">
                {evs.map((e) => <EventChip key={e.key} event={e} compact />)}
                {items.slice(0, room).map((p) => <PostCard key={p.key} post={p} compact draggable />)}
                {items.length > room && (
                  <button onClick={() => onDay(iso)} className="text-[11px] text-muted hover:text-fg">+{items.length - room} más</button>
                )}
              </div>
            </DropZone>
          );
        })}
      </div>
    </div>
  );
}
