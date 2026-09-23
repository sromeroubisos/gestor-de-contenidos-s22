"use client";

import { dayName, fromISO, MONTH_NAMES } from "@/lib/dates";
import { EVENT_ICON, isCancelled, isGoing, type TeamEvent } from "@/lib/events";
import { useStore } from "@/lib/store";
import { EventStatus, useToggleGoing } from "./EventModal";
import { Button, useBrand } from "./ui";

/** Event row used in Eventos and Mis tareas: date, who goes, task progress and a "Me sumo" shortcut. */
export function EventCard({ event: e }: { event: TeamEvent }) {
  const { openEvent, me } = useStore();
  const toggle = useToggleGoing();
  const b = useBrand(e.brand);
  const going = isGoing(e, me);
  const done = e.tasks.filter((t) => t.done).length;
  const myTasks = me ? e.tasks.filter((t) => !t.done && t.owner.toLowerCase() === me.toLowerCase()) : [];
  const d = e.date ? fromISO(e.date) : null;

  return (
    <div
      onClick={() => openEvent(e.key)}
      className={`flex cursor-pointer gap-3 rounded-xl border border-line bg-panel p-3 transition hover:border-[color:var(--muted)] hover:shadow-sm ${isCancelled(e) ? "opacity-55" : ""}`}
      style={{ borderLeft: `3px solid ${e.brand ? b.color : "var(--line)"}` }}
    >
      <div className="flex w-12 shrink-0 flex-col items-center rounded-lg bg-panel-2 py-1.5 text-center">
        {d ? (
          <>
            <span className="text-[10px] font-semibold uppercase text-muted">{MONTH_NAMES[d.getMonth()].slice(0, 3)}</span>
            <span className="text-lg font-bold leading-tight">{d.getDate()}</span>
          </>
        ) : (
          <span className="py-1 text-[10px] text-muted">Sin fecha</span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          {e.date && <span>{dayName(e.date)}</span>}
          {e.time && <span className="font-semibold text-fg">{e.time}{e.endTime ? `–${e.endTime}` : ""}</span>}
          {e.place && <span className="truncate">📍 {e.place}</span>}
          <EventStatus status={e.status} />
        </div>
        <div className={`mt-0.5 text-sm font-medium ${isCancelled(e) ? "line-through" : ""}`}>
          {EVENT_ICON[e.type] ?? "📌"} {e.title}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {e.team.length === 0 && <span className="text-[11px] text-amber-600 dark:text-amber-400">Nadie asignado todavía</span>}
          {e.team.map((m) => (
            <span key={m.name} className={`rounded-full px-2 py-0.5 text-[11px] ${m.name === me ? "bg-accent text-white" : "bg-panel-2"}`}>
              {m.name}{m.role ? ` · ${m.role}` : ""}
            </span>
          ))}
          {e.tasks.length > 0 && (
            <span className={`ml-1 text-[11px] ${done === e.tasks.length ? "text-emerald-600" : "text-muted"}`}>
              ☑ {done}/{e.tasks.length} tareas
            </span>
          )}
        </div>
        {myTasks.length > 0 && (
          <div className="mt-1 text-[11px] text-accent">Te toca: {myTasks.map((t) => t.text).join(" · ")}</div>
        )}
      </div>

      {me && !isCancelled(e) && (
        <div className="shrink-0" onClick={(ev) => ev.stopPropagation()}>
          <Button variant={going ? "outline" : "primary"} onClick={() => toggle(e)} title={going ? "Sacarme del equipo" : "Anotarme en este evento"}>
            {going ? "Voy ✓" : "Me sumo"}
          </Button>
        </div>
      )}
    </div>
  );
}
