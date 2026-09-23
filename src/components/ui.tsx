"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { formatDate } from "@/lib/dates";
import { statusColor } from "@/lib/insights";
import { useStore } from "@/lib/store";
import type { Post } from "@/lib/types";

export function useBrand(name: string) {
  const { lists } = useStore();
  return lists.brands.find((b) => b.name === name) ?? { name, emoji: "", color: "#64748b" };
}

export function StatusBadge({ status }: { status: string }) {
  const c = statusColor(status);
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: `${c}22`, color: c }}
    >
      <span className="size-1.5 rounded-full" style={{ background: c }} />
      {status || "Sin estado"}
    </span>
  );
}

export function BrandTag({ name }: { name: string }) {
  const b = useBrand(name);
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: b.color }}>
      {b.emoji} {name || "Sin marca"}
    </span>
  );
}

export function Button({
  variant = "ghost",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "outline" }) {
  const styles = {
    primary: "bg-accent text-white hover:opacity-90",
    ghost: "hover:bg-panel-2 text-fg",
    outline: "border border-line hover:bg-panel-2 text-fg",
  }[variant];
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${styles} ${className}`}
      {...props}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-panel ${className}`}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line p-4 text-center text-sm text-muted">{children}</div>;
}

/** Compact card used in lists, calendar and kanban. Draggable when `draggable` is set. */
export function PostCard({
  post,
  showDate = false,
  draggable = false,
  compact = false,
  action,
}: {
  post: Post;
  showDate?: boolean;
  draggable?: boolean;
  compact?: boolean;
  action?: ReactNode;
}) {
  const { openPost } = useStore();
  const b = useBrand(post.brand);
  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", post.key);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => openPost(post.key)}
      className={`group cursor-pointer rounded-lg border border-line bg-panel text-left transition hover:shadow-sm hover:border-[color:var(--muted)] ${compact ? "px-2 py-1" : "p-2.5"}`}
      style={{ borderLeft: `3px solid ${b.color}` }}
    >
      {compact ? (
        <div className="truncate text-xs">
          <span className="text-muted">{post.time ?? ""}</span> {b.emoji} {post.title}
        </div>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted">
              {showDate && post.date && <span>{formatDate(post.date)}</span>}
              {post.time && <span className="font-semibold text-fg">{post.time}</span>}
              <BrandTag name={post.brand} />
            </div>
            <div className="mt-0.5 line-clamp-2 text-sm font-medium">{post.title || "(sin título)"}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <StatusBadge status={post.status} />
              {post.owner && <span className="truncate text-[11px] text-muted">👤 {post.owner}</span>}
              {post.type && <span className="text-[11px] text-muted">· {post.type}</span>}
            </div>
          </div>
          {action && <div onClick={(e) => e.stopPropagation()}>{action}</div>}
        </div>
      )}
    </div>
  );
}

export function Toasts() {
  const { toasts } = useStore();
  return (
    <div className="pointer-events-none fixed bottom-20 right-4 z-[60] flex flex-col gap-2 md:bottom-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto max-w-sm rounded-lg px-4 py-2.5 text-sm shadow-lg ${
            t.kind === "error" ? "bg-red-600 text-white" : t.kind === "ok" ? "bg-emerald-600 text-white" : "bg-panel border border-line"
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function Select({
  value,
  onChange,
  options,
  placeholder,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
}) {
  const opts = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <select className={`input ${className}`} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder ?? "—"}</option>
      {opts.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
