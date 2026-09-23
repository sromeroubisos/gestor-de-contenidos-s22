"use client";

import { useEffect, useMemo, useState } from "react";
import { splitList } from "@/lib/codec";
import { dayName, formatDate, isoWeek } from "@/lib/dates";
import { useStore } from "@/lib/store";
import type { CommentEntry, HistoryEntry, Post, PostPatch } from "@/lib/types";
import { BrandTag, Button, Select, StatusBadge } from "./ui";

type Form = Required<Omit<PostPatch, "sponsors" | "date" | "time">> & { date: string; time: string; sponsors: string };

const toForm = (p: Post): Form => ({
  brand: p.brand, date: p.date ?? "", time: p.time ?? "", platform: p.platform, type: p.type, title: p.title,
  copy: p.copy, status: p.status, owner: p.owner, priority: p.priority, link: p.link, sponsors: p.sponsors.join(", "), notes: p.notes,
});

export function diffForm(base: Post, f: Form): PostPatch {
  const orig = toForm(base);
  const patch: PostPatch = {};
  (Object.keys(f) as (keyof Form)[]).forEach((k) => {
    if (f[k] === orig[k]) return;
    if (k === "date" || k === "time") patch[k] = f[k] || null;
    else if (k === "sponsors") patch.sponsors = splitList(f.sponsors);
    else patch[k] = f[k];
  });
  return patch;
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

export function PostFields({ form, set }: { form: Form; set: (f: Partial<Form>) => void }) {
  const { lists } = useStore();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Tema / Título" wide>
        <input className="input" value={form.title} onChange={(e) => set({ title: e.target.value })} />
      </Field>
      <Field label="Marca">
        <Select value={form.brand} onChange={(v) => set({ brand: v })} options={lists.brands.map((b) => b.name)} />
      </Field>
      <Field label="Estado">
        <Select value={form.status} onChange={(v) => set({ status: v })} options={lists.statuses.map((s) => s.name)} />
      </Field>
      <Field label="Fecha">
        <input type="date" className="input" value={form.date} onChange={(e) => set({ date: e.target.value })} />
      </Field>
      <Field label="Hora">
        <input type="time" className="input" value={form.time} onChange={(e) => set({ time: e.target.value })} />
      </Field>
      <Field label="Responsable">
        <Select value={form.owner} onChange={(v) => set({ owner: v })} options={lists.owners} />
      </Field>
      <Field label="Plataforma">
        <Select value={form.platform} onChange={(v) => set({ platform: v })} options={lists.platforms} />
      </Field>
      <Field label="Tipo">
        <Select value={form.type} onChange={(v) => set({ type: v })} options={lists.types} />
      </Field>
      <Field label="Prioridad">
        <Select value={form.priority} onChange={(v) => set({ priority: v })} options={lists.priorities} />
      </Field>
      <Field label="Copy" wide>
        <textarea className="input min-h-28" value={form.copy} onChange={(e) => set({ copy: e.target.value })} />
      </Field>
      <Field label="Sponsors (separados por coma)" wide>
        <input className="input" value={form.sponsors} onChange={(e) => set({ sponsors: e.target.value })} />
      </Field>
      <Field label="Link / Asset" wide>
        <input className="input" value={form.link} onChange={(e) => set({ link: e.target.value })} placeholder="https://…" />
      </Field>
      <Field label="Observaciones" wide>
        <textarea className="input min-h-16" value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
      </Field>
    </div>
  );
}

export function emptyForm(): Form {
  return { brand: "", date: "", time: "", platform: "", type: "", title: "", copy: "", status: "", owner: "", priority: "", link: "", sponsors: "", notes: "" };
}

function Preview({ link }: { link: string }) {
  const drive = link.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([\w-]+)/);
  const src = drive ? `https://drive.google.com/thumbnail?id=${drive[1]}&sz=w600` : /\.(png|jpe?g|gif|webp)(\?|$)/i.test(link) ? link : null;
  if (!link) return null;
  return (
    <a href={link} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-line">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="Adjunto" className="max-h-56 w-full object-cover" />
      ) : (
        <div className="truncate p-3 text-sm text-accent">🔗 {link}</div>
      )}
    </a>
  );
}

export function PostDrawer() {
  const { posts, openKey, openPost, update, provider, user, me, lists, refresh } = useStore();
  const live = posts.find((p) => p.key === openKey) ?? null;
  const [base, setBase] = useState<Post | null>(null);
  const [form, setForm] = useState<Form>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"ficha" | "comentarios" | "historial">("ficha");
  const [comments, setComments] = useState<CommentEntry[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [newComment, setNewComment] = useState("");

  // Capture the version the user starts editing; conflicts are checked against it.
  useEffect(() => {
    if (!openKey) return setBase(null);
    const p = posts.find((x) => x.key === openKey);
    if (p && (!base || base.key !== p.key)) {
      setBase(p);
      setForm(toForm(p));
      setTab("ficha");
    }
  }, [openKey, posts, base]);

  useEffect(() => {
    if (!base?.id || tab === "ficha") return;
    if (tab === "comentarios") provider.getComments(base.id).then(setComments).catch(() => setComments([]));
    else provider.getHistory(base.id).then(setHistory).catch(() => setHistory([]));
  }, [tab, base?.id, provider]);

  const patch = useMemo(() => (base ? diffForm(base, form) : {}), [base, form]);
  const dirty = Object.keys(patch).length > 0;
  const staleInSheet = !!(base && live && JSON.stringify(base.snapshot) !== JSON.stringify(live.snapshot) && !saving);

  if (!openKey || !base) return null;

  const close = () => {
    if (dirty && !confirm("Hay cambios sin guardar. ¿Cerrar igual?")) return;
    openPost(null);
  };
  const save = async (p: PostPatch = patch) => {
    setSaving(true);
    const ok = await update(base, p);
    setSaving(false);
    if (ok) {
      const saved = { ...base, ...p };
      setBase(null); // re-captured from the store on next render
      setForm(toForm(saved));
    }
  };
  const reloadFromSheet = async () => {
    await refresh();
    setBase(null);
  };

  const pub = lists.statuses.find((s) => /^publicad/i.test(s.name))?.name ?? "Publicado";
  const who = user?.name || me || "Demo";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={close}>
      <div className="flex h-full w-full max-w-2xl flex-col bg-bg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-line bg-panel px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="font-mono">{base.id || "sin ID"}</span>
                <BrandTag name={base.brand} />
                <StatusBadge status={base.status} />
              </div>
              <h2 className="mt-1 text-lg font-semibold leading-snug">{base.title || "(sin título)"}</h2>
              <div className="mt-0.5 text-xs text-muted">
                {base.date ? `${dayName(base.date)} ${formatDate(base.date)} · Semana ${isoWeek(base.date)}` : "Sin fecha"}
                {base.time ? ` · ${base.time}` : ""} · pestaña {base.sheetTitle}, fila {base.rowHint}
              </div>
            </div>
            <Button onClick={close} aria-label="Cerrar">✕</Button>
          </div>
          <div className="mt-3 flex gap-1">
            {(["ficha", "comentarios", "historial"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`rounded-md px-3 py-1 text-sm capitalize ${tab === t ? "bg-panel-2 font-semibold" : "text-muted"}`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {staleInSheet && (
            <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              Esta publicación fue modificada por otro usuario. Actualizá los datos antes de guardar.
              <Button variant="outline" className="ml-2" onClick={reloadFromSheet}>Actualizar datos</Button>
            </div>
          )}

          {tab === "ficha" && (
            <div className="space-y-5">
              <Preview link={form.link} />
              <PostFields form={form} set={(f) => setForm((x) => ({ ...x, ...f }))} />
              <div className="rounded-lg border border-line p-3 text-xs text-muted">
                <div className="mb-1 font-semibold text-fg">Datos de la fila (solo lectura)</div>
                <div>Origen: {base.origin || "—"}</div>
                {Object.entries(base.extra).map(([k, v]) => (
                  <div key={k}>{k}: {v}</div>
                ))}
                <div>Día / Mes / Año / Semana / Franja se calculan en el Sheet a partir de Fecha y Hora.</div>
              </div>
            </div>
          )}

          {tab === "comentarios" && (
            <div className="space-y-3">
              {!base.id && <p className="text-sm text-muted">Guardá la publicación para asignarle un ID antes de comentar.</p>}
              {comments.map((c, i) => (
                <div key={i} className="rounded-lg border border-line bg-panel p-3 text-sm">
                  <div className="text-xs text-muted">{c.user} · {c.timestamp}</div>
                  <div className="mt-1 whitespace-pre-wrap">{c.text}</div>
                </div>
              ))}
              {base.id && (
                <div className="flex gap-2">
                  <input className="input" placeholder="Escribir comentario…" value={newComment} onChange={(e) => setNewComment(e.target.value)} />
                  <Button
                    variant="primary"
                    disabled={!newComment.trim()}
                    onClick={async () => {
                      await provider.addComment(base.id, newComment.trim(), who);
                      setNewComment("");
                      setComments(await provider.getComments(base.id));
                    }}
                  >
                    Enviar
                  </Button>
                </div>
              )}
            </div>
          )}

          {tab === "historial" && (
            <div className="space-y-2">
              {history.length === 0 && <p className="text-sm text-muted">Sin cambios registrados desde la app (APP_HISTORIAL).</p>}
              {history.map((h, i) => (
                <div key={i} className="rounded-lg border border-line bg-panel px-3 py-2 text-sm">
                  <span className="text-xs text-muted">{h.timestamp} · {h.user}</span>
                  <div>
                    {h.action} {h.field && <b>{h.field}</b>} {h.field ? `${h.oldValue || "∅"} → ${h.newValue || "∅"}` : h.newValue}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-panel px-5 py-3">
          {!/^publicad/i.test(base.status) && (
            <Button variant="outline" disabled={saving || dirty} onClick={() => save({ status: pub })} title={dirty ? "Guardá primero los otros cambios" : ""}>
              ✓ Publicado
            </Button>
          )}
          <Button onClick={() => setForm(toForm(base))} disabled={!dirty || saving}>Descartar</Button>
          <Button variant="primary" onClick={() => save()} disabled={!dirty || saving}>
            {saving ? "Guardando…" : "Guardar en Sheet"}
          </Button>
        </div>
      </div>
    </div>
  );
}
