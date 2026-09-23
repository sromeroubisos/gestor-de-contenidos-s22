"use client";

import { useMemo } from "react";
import { Empty, PageHeader, PostCard, Select } from "@/components/ui";
import { taskBuckets, type TaskBucket } from "@/lib/insights";
import { useStore } from "@/lib/store";

const ORDER: TaskBucket[] = ["Atrasadas", "Hoy", "Mañana", "Esta semana", "Próximamente", "Sin fecha"];

export default function MyTasksPage() {
  const { posts, me, setMe, lists, user } = useStore();
  const mine = useMemo(() => posts.filter((p) => me && p.owner === me), [posts, me]);
  const buckets = useMemo(() => taskBuckets(mine), [mine]);

  return (
    <>
      <PageHeader
        title="Mis tareas"
        subtitle={user ? `Sesión: ${user.email}` : undefined}
        actions={
          <label className="flex items-center gap-2 text-sm text-muted">
            Soy
            <Select className="!w-auto" value={me} onChange={setMe} options={lists.owners} placeholder="Elegí tu nombre" />
          </label>
        }
      />
      {!me ? (
        <Empty>Elegí quién sos en la lista de Responsables del Sheet para ver tus publicaciones.</Empty>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {ORDER.map((b) => (
            <section key={b}>
              <h2 className={`mb-2 text-xs font-semibold uppercase tracking-wider ${b === "Atrasadas" ? "text-red-500" : "text-muted"}`}>
                {b} · {buckets[b].length}
              </h2>
              <div className="space-y-2">
                {buckets[b].length === 0 ? <Empty>—</Empty> : buckets[b].map((p) => <PostCard key={p.key} post={p} showDate />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
