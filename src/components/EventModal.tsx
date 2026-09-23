"use client";

import { useEffect, useMemo, useState } from "react";
import { dayName, formatDate } from "@/lib/dates";
import {
  emptyEvent,
  EVENT_ICON,
  EVENT_STATUSES,
  EVENT_TYPES,
  googleCalendarUrl,
  isGoing,
  TEAM_ROLES,
  toICS,
  type EventDraft,
  type TeamEvent,
} from "@/lib/events";
import { useStore } from "@/lib/store";
import { Button, Select } from "./ui";

export const eventToDraft = (e: TeamEvent): EventDraft => ({
  type: e.type, title: e.title, date: e.date, time: e.time, endTime: e.endTime, place: e.place, brand: e.brand,
  team: e.team.map((m) => ({ ...m })), tasks: e.tasks.map((t) => ({ ...t })), status: e.status, notes: e.notes,
});

export function downloadICS(events: TeamEvent[], filename: string, timeZone?: string) {
  const blob = new Blob([toICS(events, { timeZone, name: "Grupo 22 · Eventos" })], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function EventStatus({ status }: { status: string }) {
  const c = /^cancel/i.test(status) ? "#ef4444" : /confirmar/i.test(status) ? "#f59e0b" : "#10b981";
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: `${c}22`, color: c }}>
      <span className="size-1.5 rounded-full" style={{ background: c }} />
      {status}
    </span>
  );
}

/** Toggles "me" in the team straight from a list, without opening the editor. */
export function useToggleGoing() {
  const { me, saveEvent } = useStore();
  return (e: TeamEvent) => {
    if (!me) return;
    const team = isGoing(e, me) ? e.team.filter((m) => m.name.toLowerCase() !== me.toLowerCase()) : [...e.team, { name: me, role: "" }];
    return saveEvent(e, { ...eventToDraft(e), team });
  };
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

export function EventModal() {
  const { events, eventEditor, openEvent, saveEvent, lists, me, workbook } = useStore();
  const isNew = eventEditor?.key === "new";
  const live = events.find((e) => e.key === eventEditor?.key) ?? null;
  const [base, setBase] = useState<TeamEvent | null>(null);
  const [draft, setDraft] = useState<EventDraft>(emptyEvent());
  const [newTask, setNewTask] = useState("");
  const [saving, setSaving] = useState(false);

  // Capture the version the user starts editing; the save is checked against it.
  useEffect(() => {
    if (!eventEditor) return setBase(null);
    if (eventEditor.key === "new") {
      setBase(null);
      setDraft({ ...emptyEvent(), ...eventEditor.preset });
      setNewTask("");
      return;
    }
    const e = events.find((x) => x.key === eventEditor.key);
    if (e && (!base || base.key !== e.key)) {
      setBase(e);
      setDraft(eventToDraft(e));
      setNewTask("");
    }
  }, [eventEditor, events, base]);

  const initial = useMemo(() => (base ? eventToDraft(base) : { ...emptyEvent(), ...eventEditor?.preset }), [base, eventEditor]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const stale = !!(base && live && base.snapshot !== live.snapshot && !saving);

  if (!eventEditor || (!isNew && !base)) return null;

  const set = (f: Partial<EventDraft>) => setDraft((d) => ({ ...d, ...f }));
  const close = () => {
    if (dirty && !confirm("Hay cambios sin guardar. ¿Cerrar igual?")) return;
    openEvent(null);
  };
  const save = async () => {
    setSaving(true);
    const saved = await saveEvent(base, draft);
    setSaving(false);
    if (saved) openEvent(null);
  };

  const people = lists.owners;
  const notIn = people.filter((p) => !draft.team.some((m) => m.name === p));
  const going = !!me && draft.team.some((m) => m.name === me);
  const preview: TeamEvent = { ...(base ?? { key: "new", id: "", rowHint: 0, createdBy: "", updatedAt: "", snapshot: "" }), ...draft };
  const gcal = googleCalendarUrl(preview, workbook?.timeZone);
  const setTeam = (i: number, f: Partial<EventDraft["team"][number]>) => set({ team: draft.team.map((x, j) => (j === i ? { ...x, ...f } : x)) });
  const setTask = (i: number, f: Partial<EventDraft["tasks"][number]>) => set({ tasks: draft.tasks.map((x, j) => (j === i ? { ...x, ...f } : x)) });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={close}>
      <div className="flex h-full w-full max-w-2xl flex-col bg-bg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-line bg-panel px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="font-mono">{base?.id || "Nuevo evento"}</span>
                <EventStatus status={draft.status} />
              </div>
              <h2 className="mt-1 text-lg font-semibold leading-snug">
                {EVENT_ICON[draft.type] ?? "📌"} {draft.title || (isNew ? "Nuevo evento" : "(sin título)")}
              </h2>
              <div className="mt-0.5 text-xs text-muted">
                {draft.date ? `${dayName(draft.date)} ${formatDate(draft.date)}` : "Sin fecha"}
                {draft.time ? ` · ${draft.time}${draft.endTime ? `–${draft.endTime}` : ""}` : ""}
                {draft.place ? ` · ${draft.place}` : ""}
                {base?.updatedAt ? ` · actualizado ${base.updatedAt}` : ""}
              </div>
            </div>
            <Button onClick={close} aria-label="Cerrar">✕</Button>
          </div>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          {stale && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              Este evento fue modificado por otro usuario.
              <Button variant="outline" className="ml-2" onClick={() => setBase(null)}>Ver la versión nueva</Button>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Título" wide>
              <input className="input" value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="Ej: CASI vs SIC · Fecha 12" autoFocus={isNew} />
            </Field>
            <Field label="Tipo">
              <Select value={draft.type} onChange={(v) => set({ type: v || "Otro" })} options={EVENT_TYPES} />
            </Field>
            <Field label="Estado">
              <Select value={draft.status} onChange={(v) => set({ status: v || "Confirmado" })} options={EVENT_STATUSES} />
            </Field>
            <Field label="Fecha">
              <input type="date" className="input" value={draft.date ?? ""} onChange={(e) => set({ date: e.target.value || null })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Hora">
                <input type="time" className="input" value={draft.time ?? ""} onChange={(e) => set({ time: e.target.value || null })} />
              </Field>
              <Field label="Hasta">
                <input type="time" className="input" value={draft.endTime ?? ""} onChange={(e) => set({ endTime: e.target.value || null })} />
              </Field>
            </div>
            <Field label="Lugar">
              <input className="input" value={draft.place} onChange={(e) => set({ place: e.target.value })} placeholder="Cancha, club o dirección" />
            </Field>
            <Field label="Marca">
              <Select value={draft.brand} onChange={(v) => set({ brand: v })} options={lists.brands.map((b) => b.name)} />
            </Field>
          </div>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Quién va · {draft.team.length}</h3>
              {me && (
                <Button variant="outline" onClick={() => set({ team: going ? draft.team.filter((m) => m.name !== me) : [...draft.team, { name: me, role: "" }] })}>
                  {going ? "Me bajo" : "🙋 Me sumo"}
                </Button>
              )}
            </div>
            <datalist id="g22-roles">
              {TEAM_ROLES.map((r) => <option key={r} value={r} />)}
            </datalist>
            <datalist id="g22-people">
              {people.map((p) => <option key={p} value={p} />)}
            </datalist>
            <div className="space-y-2">
              {draft.team.map((m, i) => (
                <div key={i} className="flex gap-2">
                  <input className="input" list="g22-people" value={m.name} placeholder="Nombre" onChange={(e) => setTeam(i, { name: e.target.value })} />
                  <input className="input" list="g22-roles" value={m.role} placeholder="Rol (Fotos, Video…)" onChange={(e) => setTeam(i, { role: e.target.value })} />
                  <Button onClick={() => set({ team: draft.team.filter((_, j) => j !== i) })} aria-label="Quitar">✕</Button>
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {notIn.map((p) => (
                <button key={p} onClick={() => set({ team: [...draft.team, { name: p, role: "" }] })} className="rounded-full border border-line px-2.5 py-0.5 text-xs text-muted hover:bg-panel-2 hover:text-fg">
                  + {p}
                </button>
              ))}
              <button onClick={() => set({ team: [...draft.team, { name: "", role: "" }] })} className="rounded-full border border-dashed border-line px-2.5 py-0.5 text-xs text-muted hover:bg-panel-2 hover:text-fg">
                + Otra persona
              </button>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">
              Tareas · {draft.tasks.filter((t) => t.done).length}/{draft.tasks.length}
            </h3>
            <div className="space-y-1.5">
              {draft.tasks.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="checkbox" className="size-4 shrink-0" checked={t.done} onChange={(e) => setTask(i, { done: e.target.checked })} />
                  <input className={`input ${t.done ? "text-muted line-through" : ""}`} value={t.text} onChange={(e) => setTask(i, { text: e.target.value })} />
                  <Select
                    className="!w-36 shrink-0"
                    value={t.owner}
                    onChange={(v) => setTask(i, { owner: v })}
                    options={[...new Set([...draft.team.map((m) => m.name).filter(Boolean), ...people])]}
                    placeholder="Sin asignar"
                  />
                  <Button onClick={() => set({ tasks: draft.tasks.filter((_, j) => j !== i) })} aria-label="Quitar">✕</Button>
                </div>
              ))}
            </div>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newTask.trim()) return;
                set({ tasks: [...draft.tasks, { text: newTask.trim(), done: false, owner: "" }] });
                setNewTask("");
              }}
            >
              <input className="input" value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="Nueva tarea (placa previa, acreditación, llevar trípode…)" />
              <Button variant="outline" type="submit" disabled={!newTask.trim()}>Agregar</Button>
            </form>
          </section>

          <Field label="Notas">
            <textarea className="input min-h-20" value={draft.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Horario de encuentro, acreditaciones, contacto del club…" />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-panel px-5 py-3">
          {gcal && (
            <>
              <a href={gcal} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:bg-panel-2">
                📅 Google Calendar
              </a>
              <Button variant="outline" onClick={() => downloadICS([preview], `${(draft.title || "evento").replace(/[^\w\- ]+/g, "")}.ics`, workbook?.timeZone)}>
                ⬇ .ics
              </Button>
            </>
          )}
          <div className="ml-auto flex gap-2">
            <Button onClick={close} disabled={saving}>Cancelar</Button>
            <Button variant="primary" onClick={save} disabled={saving || !draft.title.trim() || (!isNew && !dirty)}>
              {saving ? "Guardando…" : isNew ? "Crear en Sheet" : "Guardar en Sheet"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
