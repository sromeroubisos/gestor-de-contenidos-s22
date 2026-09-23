"use client";

import { useState } from "react";
import { FiltersBar, useFiltered } from "@/components/Filters";
import { PageHeader, PostCard } from "@/components/ui";
import { sortByDateTime, statusColor } from "@/lib/insights";
import { useStore } from "@/lib/store";

export default function ProductionPage() {
  const { lists, posts: all, update } = useStore();
  const posts = useFiltered();
  const [over, setOver] = useState<string | null>(null);
  const columns = [...lists.statuses.map((s) => s.name), ""];

  const drop = (status: string, key: string) => {
    const p = all.find((x) => x.key === key);
    if (p && p.status !== status) update(p, { status });
  };

  return (
    <>
      <PageHeader title="Producción" subtitle="Arrastrá las tarjetas entre columnas: el Estado se actualiza en el Sheet." />
      <FiltersBar show={["brand", "owner", "platform", "type", "priority", "archive"]} />
      <div className="flex gap-3 overflow-x-auto pb-4">
        {columns.map((status) => {
          const items = posts.filter((p) => p.status === status).sort(sortByDateTime);
          if (status === "" && items.length === 0) return null;
          return (
            <div
              key={status || "none"}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(status);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                drop(status, e.dataTransfer.getData("text/plain"));
              }}
              className={`flex w-72 shrink-0 flex-col rounded-xl border border-line bg-panel-2/60 ${over === status ? "drop-target" : ""}`}
            >
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <span className="size-2 rounded-full" style={{ background: statusColor(status) }} />
                  {status || "Sin estado"}
                </span>
                <span className="text-xs text-muted">{items.length}</span>
              </div>
              <div className="max-h-[68vh] flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                {items.map((p) => <PostCard key={p.key} post={p} showDate draggable />)}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
