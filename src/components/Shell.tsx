"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { formatDateTime } from "@/lib/dates";
import { useStore } from "@/lib/store";
import { Button, Toasts } from "./ui";
import { PostDrawer } from "./PostDrawer";
import { NewPostModal } from "./NewPostModal";
import { EventModal } from "./EventModal";

const NAV = [
  { href: "/", icon: "🏠", label: "Inicio", mobile: true },
  { href: "/calendario", icon: "📅", label: "Calendario", mobile: true },
  { href: "/produccion", icon: "📋", label: "Producción", mobile: true },
  { href: "/eventos", icon: "🏉", label: "Eventos", mobile: true },
  { href: "/cronologia", icon: "🕒", label: "Cronología" },
  { href: "/mis-tareas", icon: "👤", label: "Mis tareas", mobile: true },
  { href: "/estadisticas", icon: "📊", label: "Estadísticas" },
  { href: "/sponsors", icon: "🤝", label: "Sponsors" },
  { href: "/configuracion", icon: "⚙️", label: "Configuración", mobile: true },
];

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  return (
    <Button
      variant="ghost"
      title="Cambiar tema"
      onClick={() => {
        const next = !dark;
        setDark(next);
        document.documentElement.classList.toggle("dark", next);
        localStorage.setItem("g22.theme", next ? "dark" : "light");
      }}
    >
      {dark ? "☀️" : "🌙"}
    </Button>
  );
}

function SyncStatus() {
  const { mode, sync, refresh } = useStore();
  const dot = mode === "demo" ? "bg-slate-400" : sync.state === "error" ? "bg-red-500" : sync.state === "syncing" ? "bg-amber-400 animate-pulse" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <span className="hidden items-center gap-1.5 text-xs text-muted sm:flex" title={sync.error ?? ""}>
        <span className={`size-2 rounded-full ${dot}`} />
        {mode === "demo" ? "Demo" : sync.state === "error" ? "Sin sincronizar" : sync.lastSync ? formatDateTime(sync.lastSync).slice(11) : "…"}
      </span>
      <Button variant="outline" onClick={() => refresh()} disabled={sync.state === "syncing"} title="Actualizar desde Google Sheets">
        ↻ <span className="hidden sm:inline">Actualizar</span>
      </Button>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { mode, sync, filters, setFilters, setNewOpen, connect, user } = useStore();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <div className="min-h-dvh">
      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-panel md:flex">
        <div className="px-5 py-5">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-muted">Grupo 22</div>
          <div className="text-lg font-bold tracking-tight">Content Manager</div>
        </div>
        <div className="px-5 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Principal</div>
        <nav className="flex flex-col gap-0.5 px-3">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                active(n.href) ? "bg-panel-2 font-semibold" : "text-muted hover:bg-panel-2 hover:text-fg"
              }`}
            >
              <span className="w-5 text-center">{n.icon}</span>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t border-line p-4 text-xs text-muted">
          {user ? (
            <>
              <div className="truncate font-medium text-fg">{user.name}</div>
              <div className="truncate">{user.email}</div>
            </>
          ) : mode === "google" ? (
            "Conectado al Sheet"
          ) : (
            "Sin conexión con Google"
          )}
        </div>
      </aside>

      <div className="md:pl-60">
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-bg/85 px-4 py-3 backdrop-blur md:px-6">
          <input
            className="input max-w-md"
            placeholder="Buscar publicación..."
            value={filters.q}
            onChange={(e) => setFilters({ q: e.target.value })}
          />
          <div className="ml-auto flex items-center gap-1.5">
            <SyncStatus />
            <ThemeToggle />
            <Button variant="primary" onClick={() => setNewOpen(true)}>
              + <span className="hidden sm:inline">Nueva publicación</span>
            </Button>
          </div>
        </header>

        {mode === "demo" && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm md:px-6">
            <span>Estás viendo <b>datos de demostración</b>. Conectá Google para trabajar sobre el Sheet real.</span>
            <Link href="/configuracion" className="font-medium text-accent underline">Conectar con el Sheet</Link>
          </div>
        )}
        {mode === "google" && sync.state === "error" && (
          <div className="border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-sm md:px-6">
            {sync.error} Los datos visibles son los últimos sincronizados; se reintenta automáticamente.
            {/expir|401/i.test(sync.error ?? "") && (
              <Button variant="outline" className="ml-2" onClick={connect}>Reconectar</Button>
            )}
          </div>
        )}

        <main className="px-4 pb-24 pt-5 md:px-6 md:pb-10">{children}</main>
      </div>

      {/* Bottom nav (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-panel md:hidden">
        {NAV.filter((n) => n.mobile).map((n) => (
          <Link key={n.href} href={n.href} className={`flex flex-1 flex-col items-center py-2 text-[10px] ${active(n.href) ? "font-semibold" : "text-muted"}`}>
            <span className="text-lg leading-none">{n.icon}</span>
            {n.label}
          </Link>
        ))}
      </nav>

      <PostDrawer />
      <NewPostModal />
      <EventModal />
      <Toasts />
    </div>
  );
}
