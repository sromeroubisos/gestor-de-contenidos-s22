"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { Button } from "./ui";
import { diffForm, emptyForm, PostFields } from "./PostDrawer";
import { emptyPost } from "@/lib/codec";

export function NewPostModal() {
  const { newOpen, setNewOpen, create, openPost, lists, me } = useStore();
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (newOpen) setForm({ ...emptyForm(), status: lists.statuses[0]?.name ?? "", owner: me });
  }, [newOpen, lists.statuses, me]);

  if (!newOpen) return null;

  const submit = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    const saved = await create(diffForm(emptyPost({ source: "contenidos", title: "" }, 0), form));
    setSaving(false);
    if (saved) {
      setNewOpen(false);
      openPost(saved.key);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setNewOpen(false)}>
      <div className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-bg p-5 shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Nueva publicación</h2>
          <Button onClick={() => setNewOpen(false)}>✕</Button>
        </div>
        <PostFields form={form} set={(f) => setForm((x) => ({ ...x, ...f }))} />
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setNewOpen(false)}>Cancelar</Button>
          <Button variant="primary" onClick={submit} disabled={saving || !form.title.trim()}>
            {saving ? "Creando…" : "Crear en Sheet"}
          </Button>
        </div>
      </div>
    </div>
  );
}
