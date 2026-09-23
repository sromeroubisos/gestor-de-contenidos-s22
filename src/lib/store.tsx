"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DemoDataProvider } from "./demo";
import type { EventDraft, TeamEvent } from "./events";
import { getUserEmail, RestTransport, ScriptTransport, signIn, signOut, storedToken } from "./google";
import { EMPTY_FILTERS, guessOwner, type Filters } from "./insights";
import { GoogleSheetsDataProvider, type DataProvider } from "./provider";
import { ConflictError, type Lists, type Post, type PostPatch, type SyncState, type WorkbookMap } from "./types";

export const DEFAULT_SPREADSHEET_ID = process.env.NEXT_PUBLIC_SPREADSHEET_ID || "1s3Oxl9J6pqQt6C-xNS9zNmpQkZ6yKQHrhTr9_sQ7iv4";
const POLL_MS = 20_000;

export interface ScriptConfig {
  url: string;
  key: string;
}

interface Toast {
  id: number;
  kind: "ok" | "error" | "info";
  text: string;
}

interface Store {
  mode: "demo" | "google";
  user: { email: string; name: string } | null;
  me: string;
  setMe: (o: string) => void;
  clientId: string;
  setClientId: (id: string) => void;
  script: ScriptConfig;
  setScript: (s: ScriptConfig) => void;
  spreadsheetId: string;
  posts: Post[];
  lists: Lists;
  workbook: WorkbookMap | null;
  sync: { state: SyncState; lastSync: Date | null; error: string | null };
  filters: Filters;
  setFilters: (f: Partial<Filters>) => void;
  openKey: string | null;
  openPost: (key: string | null) => void;
  newOpen: boolean;
  setNewOpen: (v: boolean) => void;
  toasts: Toast[];
  toast: (kind: Toast["kind"], text: string) => void;
  connect: () => Promise<void>;
  disconnect: () => void;
  refresh: (reanalyze?: boolean) => Promise<void>;
  update: (post: Post, patch: PostPatch) => Promise<boolean>;
  create: (patch: PostPatch) => Promise<Post | null>;
  events: TeamEvent[];
  /** Event open in the editor: an existing key, or "new" with optional prefilled fields. */
  eventEditor: { key: string; preset?: Partial<EventDraft> } | null;
  openEvent: (key: string | null, preset?: Partial<EventDraft>) => void;
  saveEvent: (prev: TeamEvent | null, draft: EventDraft) => Promise<TeamEvent | null>;
  provider: DataProvider;
}

const Ctx = createContext<Store | null>(null);

const EMPTY_LISTS: Lists = { brands: [], statuses: [], platforms: [], types: [], priorities: [], owners: [] };

function readLS(key: string, fallback = "") {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [provider, setProvider] = useState<DataProvider>(() => new DemoDataProvider());
  const [user, setUser] = useState<Store["user"]>(null);
  const [me, setMeState] = useState("");
  const [clientId, setClientIdState] = useState(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "");
  const [script, setScriptState] = useState<ScriptConfig>({
    url: process.env.NEXT_PUBLIC_SCRIPT_URL ?? "",
    key: process.env.NEXT_PUBLIC_SCRIPT_KEY ?? "",
  });
  const [posts, setPosts] = useState<Post[]>([]);
  const [events, setEvents] = useState<TeamEvent[]>([]);
  const [eventEditor, setEventEditor] = useState<Store["eventEditor"]>(null);
  const [lists, setLists] = useState<Lists>(EMPTY_LISTS);
  const [workbook, setWorkbook] = useState<WorkbookMap | null>(null);
  const [sync, setSync] = useState<Store["sync"]>({ state: "idle", lastSync: null, error: null });
  const [filters, setFiltersState] = useState<Filters>(EMPTY_FILTERS);
  const [openKey, openPost] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const writing = useRef(0);

  const toast = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 7000 : 3500);
  }, []);

  const load = useCallback(async (p: DataProvider, reanalyze = false) => {
    setSync((s) => ({ ...s, state: "syncing" }));
    try {
      const snap = await p.load(reanalyze);
      setPosts(snap.posts);
      setEvents(snap.events);
      setLists(snap.lists);
      setWorkbook(snap.workbook);
      setSync({ state: "ok", lastSync: new Date(), error: null });
    } catch (e) {
      // Never clear what's on screen because the API failed.
      setSync((s) => ({ ...s, state: "error", error: `No se pudo sincronizar con Google Sheets. ${(e as Error).message}` }));
    }
  }, []);

  /** Google login + Sheets API. */
  const startGoogle = useCallback(async () => {
    const p = new GoogleSheetsDataProvider(new RestTransport(DEFAULT_SPREADSHEET_ID), DEFAULT_SPREADSHEET_ID);
    setProvider(p);
    setPosts([]);
    const u = await getUserEmail().catch(() => ({ email: "", name: "" }));
    setUser(u);
    await load(p, true);
    return u;
  }, [load]);

  /** Apps Script bridge: no login needed. */
  const startScript = useCallback(
    async (s: ScriptConfig) => {
      const p = new GoogleSheetsDataProvider(new ScriptTransport(s.url, s.key), DEFAULT_SPREADSHEET_ID);
      setProvider(p);
      setPosts([]);
      setUser(null);
      await load(p, true);
    },
    [load],
  );

  // Boot: restore settings and connect automatically when possible.
  useEffect(() => {
    const cid = readLS("g22.clientId");
    if (cid && !process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) setClientIdState(cid);
    setMeState(readLS("g22.me"));
    const s = { url: readLS("g22.scriptUrl", script.url), key: readLS("g22.scriptKey", script.key) };
    setScriptState(s);
    if (s.url && s.key) startScript(s);
    else if (storedToken()) startGoogle();
    else load(provider);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-pick "who am I" from the Google account the first time.
  useEffect(() => {
    if (user && !me && lists.owners.length) {
      const g = guessOwner(lists.owners, user.email, user.name);
      if (g) setMeState(g);
    }
  }, [user, me, lists.owners]);

  // Periodic refresh so changes made directly in the Sheet show up.
  useEffect(() => {
    if (provider.kind !== "google") return;
    const tick = () => {
      if (document.visibilityState === "visible" && writing.current === 0) load(provider);
    };
    const id = setInterval(tick, POLL_MS);
    window.addEventListener("focus", tick);
    window.addEventListener("online", tick);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", tick);
      window.removeEventListener("online", tick);
    };
  }, [provider, load]);

  const connect = useCallback(async () => {
    if (script.url && script.key) {
      await startScript(script);
      return;
    }
    if (!clientId) {
      toast("error", "Falta configurar la conexión (ver Configuración).");
      return;
    }
    try {
      await signIn(clientId);
      const u = await startGoogle();
      toast("ok", `Conectado como ${u.email || "usuario de Google"}`);
    } catch (e) {
      toast("error", (e as Error).message);
    }
  }, [clientId, script, startGoogle, startScript, toast]);

  const disconnect = useCallback(() => {
    signOut();
    localStorage.removeItem("g22.scriptUrl");
    localStorage.removeItem("g22.scriptKey");
    setScriptState({ url: "", key: "" });
    const p = new DemoDataProvider();
    setProvider(p);
    setUser(null);
    setWorkbook(null);
    load(p);
  }, [load]);

  const refresh = useCallback((reanalyze = false) => load(provider, reanalyze), [load, provider]);

  const who = user?.name || user?.email || me || (provider.kind === "demo" ? "Demo" : "App");

  const update = useCallback(
    async (post: Post, patch: PostPatch) => {
      writing.current++;
      setPosts((ps) => ps.map((p) => (p.key === post.key ? { ...p, ...patch } : p)));
      try {
        const saved = await provider.updatePost(post, patch, who);
        setPosts((ps) => ps.map((p) => (p.key === post.key ? saved : p)));
        if (saved.key !== post.key && openKey === post.key) openPost(saved.key);
        toast("ok", provider.kind === "google" ? "Guardado en Google Sheets ✓" : "Guardado (demo)");
        return true;
      } catch (e) {
        setPosts((ps) => ps.map((p) => (p.key === post.key ? post : p)));
        if (e instanceof ConflictError) {
          toast("error", `${e.message} (cambió: ${e.changedFields.join(", ")})`);
          load(provider);
        } else toast("error", (e as Error).message);
        return false;
      } finally {
        writing.current--;
      }
    },
    [provider, who, toast, load, openKey],
  );

  const create = useCallback(
    async (patch: PostPatch) => {
      writing.current++;
      try {
        const saved = await provider.createPost(patch, who);
        setPosts((ps) => [...ps, saved]);
        toast("ok", `Publicación ${saved.id} creada`);
        return saved;
      } catch (e) {
        toast("error", (e as Error).message);
        return null;
      } finally {
        writing.current--;
      }
    },
    [provider, who, toast],
  );

  const saveEvent = useCallback(
    async (prev: TeamEvent | null, draft: EventDraft) => {
      writing.current++;
      if (prev) setEvents((es) => es.map((e) => (e.key === prev.key ? { ...e, ...draft } : e)));
      try {
        const saved = await provider.saveEvent(prev, draft, who);
        setEvents((es) => (prev ? es.map((e) => (e.key === prev.key ? saved : e)) : [...es, saved]));
        toast("ok", provider.kind === "google" ? "Evento guardado en Google Sheets ✓" : "Evento guardado (demo)");
        return saved;
      } catch (e) {
        if (prev) setEvents((es) => es.map((x) => (x.key === prev.key ? prev : x)));
        toast("error", (e as Error).message);
        load(provider);
        return null;
      } finally {
        writing.current--;
      }
    },
    [provider, who, toast, load],
  );

  const value = useMemo<Store>(
    () => ({
      mode: provider.kind,
      user,
      me,
      setMe: (o) => {
        setMeState(o);
        localStorage.setItem("g22.me", o);
      },
      clientId,
      setClientId: (id) => {
        setClientIdState(id);
        localStorage.setItem("g22.clientId", id);
      },
      script,
      setScript: (s) => {
        setScriptState(s);
        localStorage.setItem("g22.scriptUrl", s.url);
        localStorage.setItem("g22.scriptKey", s.key);
        if (s.url && s.key) startScript(s);
      },
      spreadsheetId: DEFAULT_SPREADSHEET_ID,
      posts,
      lists,
      workbook,
      sync,
      filters,
      setFilters: (f) => setFiltersState((prev) => ({ ...prev, ...f })),
      openKey,
      openPost,
      newOpen,
      setNewOpen,
      toasts,
      toast,
      connect,
      disconnect,
      refresh,
      update,
      create,
      events,
      eventEditor,
      openEvent: (key, preset) => setEventEditor(key ? { key, preset } : null),
      saveEvent,
      provider,
    }),
    [provider, user, me, clientId, script, startScript, posts, lists, workbook, sync, filters, openKey, newOpen, toasts, toast, connect, disconnect, refresh, update, create, events, eventEditor, saveEvent],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore fuera de StoreProvider");
  return s;
}
