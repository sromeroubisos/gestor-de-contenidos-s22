// Demo data, used ONLY while Google Sheets is not connected. Disappears once connected.
import { emptyPost } from "./codec";
import { addDays, formatDateTime, todayISO } from "./dates";
import type { DataProvider, Snapshot } from "./provider";
import type { CommentEntry, HistoryEntry, Lists, Post, PostPatch } from "./types";

const LISTS: Lists = {
  brands: [
    { name: "Salida de 22", emoji: "🏉", color: "#00A365" },
    { name: "Corner Corto 22", emoji: "🏑", color: "#7B3FE4" },
    { name: "Grupo 22", emoji: "🎯", color: "#E8A300" },
  ],
  statuses: [
    { name: "Idea", countsAsPending: true },
    { name: "Pendiente", countsAsPending: true },
    { name: "En producción", countsAsPending: true },
    { name: "Diseñado", countsAsPending: true },
    { name: "Revisar", countsAsPending: true },
    { name: "Aprobado", countsAsPending: false },
    { name: "Programado", countsAsPending: false },
    { name: "Publicado", countsAsPending: false },
    { name: "Cancelado", countsAsPending: false },
  ],
  platforms: ["Instagram", "TikTok", "YouTube", "Facebook", "X"],
  types: ["Post", "Placa informativa", "Carrusel", "Reel", "Historia"],
  priorities: ["Alta", "Media", "Baja"],
  owners: ["Demo A", "Demo B", "Demo C"],
};

const SEED: [number, string, string, string, string, string, string][] = [
  [0, "10:00", "Salida de 22", "Placa informativa", "Demo · Nominados al premio", "Revisar", "Demo A"],
  [0, "13:30", "Corner Corto 22", "Reel", "Demo · Resumen de la fecha", "En producción", "Demo B"],
  [0, "19:00", "Grupo 22", "Post", "Demo · Anuncio institucional", "Programado", "Demo C"],
  [-2, "18:00", "Salida de 22", "Carrusel", "Demo · Resultados del fin de semana", "Pendiente", "Demo A"],
  [1, "09:00", "Corner Corto 22", "Placa informativa", "Demo · Convocatoria seleccionado", "Idea", ""],
  [1, "20:00", "Salida de 22", "Historia", "Demo · Previa del partido", "Diseñado", "Demo B"],
  [3, "12:00", "Grupo 22", "Reel", "Demo · Detrás de escena", "Aprobado", "Demo C"],
  [5, "17:00", "Corner Corto 22", "Carrusel", "Demo · Fixture del torneo", "Pendiente", "Demo A"],
  [-5, "11:00", "Salida de 22", "Placa informativa", "Demo · Tabla de posiciones", "Publicado", "Demo A"],
  [-1, "21:00", "Corner Corto 22", "Post", "Demo · Goleadora de la fecha", "Publicado", "Demo B"],
];

function build(): Post[] {
  const today = todayISO();
  const posts: Post[] = SEED.map(([d, time, brand, type, title, status, owner], i) => ({
    ...emptyPost({ source: "contenidos", title: "DEMO" }, i + 2),
    key: `DEMO-${String(i + 1).padStart(4, "0")}`,
    id: `DEMO-${String(i + 1).padStart(4, "0")}`,
    date: addDays(today, d), time, brand, type, title, status, owner,
    platform: "Instagram", priority: i % 3 === 0 ? "Alta" : "Media",
    sponsors: i % 2 === 0 ? ["Sponsor Demo 1"] : ["Sponsor Demo 2"],
  }));
  posts.push({ ...emptyPost({ source: "contenidos", title: "DEMO" }, 99), key: "DEMO-0099", id: "DEMO-0099", brand: "Grupo 22", title: "Demo · Idea sin fecha", status: "Idea" });
  return posts;
}

export class DemoDataProvider implements DataProvider {
  readonly kind = "demo" as const;
  private posts = build();
  private history: HistoryEntry[] = [];
  private comments: CommentEntry[] = [];

  async load(): Promise<Snapshot> {
    return { posts: this.posts.map((p) => ({ ...p })), lists: LISTS, workbook: null };
  }

  async updatePost(post: Post, patch: PostPatch, user: string): Promise<Post> {
    const i = this.posts.findIndex((p) => p.key === post.key);
    const next = { ...this.posts[i], ...patch };
    this.posts[i] = next;
    Object.keys(patch).forEach((f) =>
      this.history.unshift({ timestamp: formatDateTime(new Date()), user, postId: post.id, action: "Editar", field: f, oldValue: String(post[f as keyof Post] ?? ""), newValue: String(patch[f as keyof PostPatch] ?? "") }),
    );
    return { ...next };
  }

  async createPost(patch: PostPatch, user: string): Promise<Post> {
    const id = `DEMO-${String(this.posts.length + 100).padStart(4, "0")}`;
    const post = { ...emptyPost({ source: "contenidos", title: "DEMO" }, 0), ...patch, id, key: id };
    this.posts.push(post);
    this.history.unshift({ timestamp: formatDateTime(new Date()), user, postId: id, action: "Crear", field: "", oldValue: "", newValue: post.title });
    return { ...post };
  }

  async getHistory(postId?: string) {
    return this.history.filter((h) => !postId || h.postId === postId);
  }
  async getComments(postId: string) {
    return this.comments.filter((c) => c.postId === postId);
  }
  async addComment(postId: string, text: string, user: string) {
    this.comments.push({ timestamp: formatDateTime(new Date()), user, postId, text });
  }
}
