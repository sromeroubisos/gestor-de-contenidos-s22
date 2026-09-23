"use client";

import { FiltersBar, useFiltered } from "@/components/Filters";
import { Card, PageHeader } from "@/components/ui";
import { dayName, DAY_NAMES, isoWeek } from "@/lib/dates";
import { countBy, statusColor } from "@/lib/insights";
import { useStore } from "@/lib/store";

function Bars({ title, data, color }: { title: string; data: [string, number][]; color?: (label: string) => string }) {
  const max = Math.max(1, ...data.map((d) => d[1]));
  return (
    <Card className="p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {data.length === 0 && <p className="text-sm text-muted">Sin datos</p>}
      <div className="space-y-2">
        {data.slice(0, 12).map(([label, n]) => (
          <div key={label} className="grid grid-cols-[120px_1fr_32px] items-center gap-2 text-xs">
            <span className="truncate text-muted" title={label}>{label}</span>
            <div className="h-2.5 rounded-full bg-panel-2">
              <div className="h-full rounded-full" style={{ width: `${(n / max) * 100}%`, background: color?.(label) ?? "var(--accent)" }} />
            </div>
            <span className="text-right font-semibold">{n}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function StatsPage() {
  const { lists } = useStore();
  const posts = useFiltered();
  const dated = posts.filter((p) => p.date);
  const brandColor = (n: string) => lists.brands.find((b) => b.name === n)?.color ?? "var(--accent)";
  const byDay = DAY_NAMES.map((d) => [d, dated.filter((p) => dayName(p.date!) === d).length] as [string, number]);
  const byWeek = countBy(dated, (p) => `${p.date!.slice(0, 4)} · Sem ${String(isoWeek(p.date!)).padStart(2, "0")}`).sort((a, b) => b[0].localeCompare(a[0]));

  return (
    <>
      <PageHeader title="Estadísticas" subtitle={`${posts.length} publicaciones (${dated.length} con fecha)`} />
      <FiltersBar show={["brand", "owner", "status", "dates", "archive"]} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Bars title="Por marca" data={countBy(posts, (p) => p.brand)} color={brandColor} />
        <Bars title="Por estado" data={countBy(posts, (p) => p.status || "(sin estado)")} color={statusColor} />
        <Bars title="Por responsable" data={countBy(posts, (p) => p.owner || "(sin responsable)")} />
        <Bars title="Por plataforma" data={countBy(posts, (p) => p.platform)} />
        <Bars title="Por tipo" data={countBy(posts, (p) => p.type)} />
        <Bars title="Por sponsor" data={countBy(posts, (p) => (p.sponsors.length ? p.sponsors : ["(sin sponsor)"]))} />
        <Bars title="Por día de la semana" data={byDay} />
        <Bars title="Por semana (recientes)" data={byWeek} />
      </div>
    </>
  );
}
