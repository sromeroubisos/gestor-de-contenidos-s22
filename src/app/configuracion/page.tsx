"use client";

import { useEffect, useState } from "react";
import { Button, Card, PageHeader, Select } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";
import { FIELD_LABELS, mapColumns } from "@/lib/schema";
import { useStore } from "@/lib/store";
import type { FieldKey } from "@/lib/types";

const ROLE_LABEL: Record<string, string> = {
  posts: "Publicaciones (lectura/escritura)",
  archive: "Histórico de publicaciones (lectura/escritura)",
  config: "Listas y configuración (lectura)",
  history: "Historial de cambios de la app",
  comments: "Comentarios de la app",
  attachments: "Adjuntos de la app",
  view: "Vista automática (no se toca)",
  backup: "Backup (no se toca)",
  unknown: "—",
};

export default function SettingsPage() {
  const { mode, user, workbook, sync, refresh, connect, disconnect, clientId, setClientId, script, setScript, spreadsheetId, me, setMe, lists, posts } = useStore();
  const [cid, setCid] = useState(clientId);
  const [surl, setSurl] = useState(script.url);
  const [skey, setSkey] = useState(script.key);
  useEffect(() => {
    setSurl(script.url);
    setSkey(script.key);
  }, [script]);
  const postsTab = workbook?.sheets.find((s) => s.title === workbook.postsSheet);
  const map = postsTab ? mapColumns(postsTab.headers) : {};

  return (
    <>
      <PageHeader title="Configuración" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Conexión con Google Sheets</h2>
          <dl className="space-y-2 text-sm">
            <Row k="Estado">
              {mode === "demo" ? "⚪ Sin conectar (datos de demostración)" : sync.state === "error" ? "🔴 Error de sincronización" : "🟢 Conectado"}
            </Row>
            <Row k="Spreadsheet">{workbook?.title ?? "—"}</Row>
            <Row k="ID"><code className="break-all text-xs">{spreadsheetId}</code></Row>
            <Row k="Cuenta">{user?.email ?? "—"}</Row>
            <Row k="Última sincronización">{sync.lastSync ? formatDateTime(sync.lastSync) : "—"}</Row>
            <Row k="Publicaciones cargadas">{posts.length}</Row>
          </dl>
          {sync.error && <p className="mt-3 text-sm text-red-500">{sync.error}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            {mode === "google" ? (
              <>
                <Button variant="primary" onClick={() => refresh(true)}>↻ Sincronizar ahora</Button>
                <Button variant="outline" onClick={disconnect}>Desconectar</Button>
              </>
            ) : (
              clientId && <Button variant="outline" onClick={connect}>Iniciar sesión con Google</Button>
            )}
            <a className="inline-flex items-center px-3 text-sm text-accent underline" href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`} target="_blank" rel="noreferrer">
              Abrir Sheet ↗
            </a>
          </div>

          <div className="mt-5 space-y-2 border-t border-line pt-4">
            <div className="text-sm font-semibold">Conexión por Apps Script (recomendada)</div>
            <input className="input" value={surl} onChange={(e) => setSurl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" />
            <input className="input" value={skey} onChange={(e) => setSkey(e.target.value)} placeholder="Clave (la misma que CLAVE en el script)" />
            <Button variant="primary" onClick={() => setScript({ url: surl.trim(), key: skey.trim() })} disabled={!surl.trim() || !skey.trim()}>
              Conectar
            </Button>
            <p className="text-xs text-muted">Instrucciones en README.md → “Conectar con el Sheet”.</p>
          </div>

          <div className="mt-5 border-t border-line pt-4">
            <label className="mb-1 block text-xs font-medium text-muted">Alternativa: Google OAuth Client ID</label>
            <div className="flex gap-2">
              <input className="input" value={cid} onChange={(e) => setCid(e.target.value)} placeholder="xxxx.apps.googleusercontent.com" />
              <Button variant="outline" onClick={() => setClientId(cid.trim())} disabled={cid.trim() === clientId}>Guardar</Button>
            </div>
            <p className="mt-1 text-xs text-muted">Ver README.md → “Configurar Google”. Permiso solicitado: solo Google Sheets.</p>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Mi usuario</h2>
          <label className="text-sm text-muted">Responsable con el que aparezco en el Sheet</label>
          <Select value={me} onChange={setMe} options={lists.owners} placeholder="Elegí tu nombre" />
          <p className="mt-2 text-xs text-muted">Se usa en “Mis tareas”. Los responsables salen de ⚙️ CONFIGURACIÓN y de los datos reales.</p>
        </Card>

        {workbook && (
          <Card className="p-5 lg:col-span-2">
            <h2 className="mb-1 font-semibold">Estructura detectada</h2>
            <p className="mb-3 text-xs text-muted">Analizada {formatDateTime(new Date(workbook.analyzedAt))} · locale {workbook.locale} · {workbook.timeZone}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr><th className="py-1 pr-4">Pestaña</th><th className="pr-4">Uso en la app</th><th>Columnas</th></tr>
                </thead>
                <tbody>
                  {workbook.sheets.map((s) => (
                    <tr key={s.title} className="border-t border-line align-top">
                      <td className="py-1.5 pr-4 font-medium">{s.title}{s.hidden ? " (oculta)" : ""}</td>
                      <td className="pr-4 text-muted">{ROLE_LABEL[s.role]}</td>
                      <td className="text-xs text-muted">{s.role === "view" ? "—" : s.headers.filter(Boolean).length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {postsTab && (
              <>
                <h3 className="mb-2 mt-5 text-sm font-semibold">Mapeo de columnas · {postsTab.title}</h3>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(FIELD_LABELS) as FieldKey[]).map((k) => (
                    <span key={k} className={`rounded-md border px-2 py-0.5 text-xs ${map[k] !== undefined ? "border-line" : "border-red-500/40 text-red-500"}`}>
                      {FIELD_LABELS[k]} → {map[k] !== undefined ? postsTab.headers[map[k]!] : "no encontrada"}
                    </span>
                  ))}
                </div>
              </>
            )}
          </Card>
        )}
      </div>
    </>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{k}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
