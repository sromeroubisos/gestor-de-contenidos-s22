// Transports to reach the Google Sheet. The DataProvider only talks to `Transport`,
// so it works the same over:
//   - ScriptTransport: an Apps Script web app bound to the Sheet (no Google Cloud setup).
//   - RestTransport:   Google Sheets API v4 with the user's Google login (OAuth Client ID).
/* eslint-disable @typescript-eslint/no-explicit-any */

declare global {
  interface Window {
    google?: any;
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type Render = "UNFORMATTED" | "FORMATTED" | "FORMULA";
export type CellValue = string | number | boolean | null;

export interface SheetMeta {
  title: string;
  locale: string;
  timeZone: string;
  sheets: { sheetId: number; title: string; index: number; hidden: boolean }[];
}

export interface Transport {
  meta(): Promise<SheetMeta>;
  batchGet(ranges: string[], render?: Render): Promise<CellValue[][][]>;
  /** USER_ENTERED writes, one range each. Returns the number of updated cells. */
  batchUpdate(data: { range: string; values: (string | number)[][] }[]): Promise<number>;
  /** Appends rows (as literal text) to the end of a tab. */
  append(sheetTitle: string, rows: string[][]): Promise<void>;
  addSheet(title: string, headers: string[]): Promise<void>;
}

// ---------------- Apps Script ----------------

export class ScriptTransport implements Transport {
  constructor(
    private url: string,
    private key: string,
  ) {}

  private async call<T = any>(op: string, payload: object = {}, attempt = 0): Promise<T> {
    let res: Response;
    try {
      res = await fetch(this.url, {
        method: "POST",
        // text/plain avoids a CORS preflight, which Apps Script does not answer.
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ ...payload, op, key: this.key }),
      });
    } catch {
      if (attempt < 2) return this.retry(op, payload, attempt);
      throw new ApiError(0, "No se pudo sincronizar con Google Sheets.");
    }
    const text = await res.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      if (res.status >= 500 && attempt < 2) return this.retry(op, payload, attempt);
      throw new ApiError(res.status, "El Apps Script no respondió JSON. ¿Está implementado como aplicación web con acceso “Cualquier persona”?");
    }
    if (json.error) throw new ApiError(json.error.code ?? 500, json.error.message ?? "Error del Apps Script");
    return json as T;
  }

  private async retry<T>(op: string, payload: object, attempt: number): Promise<T> {
    await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
    return this.call<T>(op, payload, attempt + 1);
  }

  meta() {
    return this.call<SheetMeta>("meta");
  }
  async batchGet(ranges: string[], render: Render = "UNFORMATTED") {
    const r = await this.call<{ valueRanges: { values: CellValue[][] }[] }>("batchGet", { ranges, render });
    return r.valueRanges.map((v) => v.values ?? []);
  }
  async batchUpdate(data: { range: string; values: (string | number)[][] }[]) {
    return (await this.call<{ totalUpdatedCells: number }>("batchUpdate", { data })).totalUpdatedCells;
  }
  async append(sheetTitle: string, rows: string[][]) {
    await this.call("append", { sheet: sheetTitle, values: rows });
  }
  async addSheet(title: string, headers: string[]) {
    await this.call("addSheet", { title, headers });
  }
}

// ---------------- Sheets API v4 + Google login ----------------

const SCOPES = "https://www.googleapis.com/auth/spreadsheets openid email profile";
const TOKEN_KEY = "g22.token";
let tokenClient: any = null;
let pending: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null;

function loadScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("No se pudo cargar el login de Google."));
    document.head.appendChild(s);
  });
}

export function storedToken(): string | null {
  try {
    const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? "null");
    return t && t.exp > Date.now() ? t.value : null;
  } catch {
    return null;
  }
}

/** Opens the Google popup. Must be called from a click. */
export async function signIn(clientId: string): Promise<string> {
  await loadScript();
  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (r: any) => {
        if (r.error) pending?.reject(new Error(r.error_description || r.error));
        else {
          const exp = Date.now() + ((Number(r.expires_in) || 3600) - 60) * 1000;
          sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ value: r.access_token, exp }));
          pending?.resolve(r.access_token);
        }
        pending = null;
      },
      error_callback: (e: any) => {
        pending?.reject(new Error(e?.message || "Inicio de sesión cancelado."));
        pending = null;
      },
    });
  }
  return new Promise((resolve, reject) => {
    pending = { resolve, reject };
    tokenClient.requestAccessToken();
  });
}

export function signOut() {
  const t = storedToken();
  if (t) window.google?.accounts?.oauth2?.revoke(t, () => {});
  sessionStorage.removeItem(TOKEN_KEY);
}

async function api<T = any>(url: string, init: RequestInit = {}, attempt = 0): Promise<T> {
  const token = storedToken();
  if (!token) throw new ApiError(401, "La sesión de Google expiró. Volvé a conectar.");
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, "No se pudo sincronizar con Google Sheets.");
  }
  if ((res.status === 429 || res.status >= 500) && attempt < 2) {
    await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
    return api<T>(url, init, attempt + 1);
  }
  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try {
      msg = (await res.json()).error?.message ?? msg;
    } catch {}
    if (res.status === 401) sessionStorage.removeItem(TOKEN_KEY);
    throw new ApiError(res.status, msg);
  }
  return res.json();
}

export async function getUserEmail(): Promise<{ email: string; name: string }> {
  const u = await api("https://www.googleapis.com/oauth2/v3/userinfo");
  return { email: u.email ?? "", name: u.given_name || u.name || u.email || "" };
}

const RENDER_QS: Record<Render, string> = {
  UNFORMATTED: "valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER",
  FORMATTED: "valueRenderOption=FORMATTED_VALUE",
  FORMULA: "valueRenderOption=FORMULA",
};

export class RestTransport implements Transport {
  private base: string;
  constructor(spreadsheetId: string) {
    this.base = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
  }
  async meta(): Promise<SheetMeta> {
    const m = await api(`${this.base}?fields=properties(title,locale,timeZone),sheets(properties(sheetId,title,index,hidden))`);
    return {
      title: m.properties.title,
      locale: m.properties.locale,
      timeZone: m.properties.timeZone,
      sheets: m.sheets.map((s: any) => ({ ...s.properties, hidden: !!s.properties.hidden })),
    };
  }
  async batchGet(ranges: string[], render: Render = "UNFORMATTED") {
    const q = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join("&");
    const res = await api(`${this.base}/values:batchGet?${q}&${RENDER_QS[render]}`);
    return (res.valueRanges ?? []).map((vr: { values?: CellValue[][] }) => vr.values ?? []);
  }
  async batchUpdate(data: { range: string; values: (string | number)[][] }[]) {
    const res = await api(`${this.base}/values:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
    });
    return res.totalUpdatedCells ?? 0;
  }
  async append(sheetTitle: string, rows: string[][]) {
    const range = encodeURIComponent(`'${sheetTitle.replace(/'/g, "''")}'!A1`);
    await api(`${this.base}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: "POST",
      body: JSON.stringify({ values: rows }),
    });
  }
  async addSheet(title: string, headers: string[]) {
    try {
      await api(`${this.base}:batchUpdate`, {
        method: "POST",
        body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }),
      });
    } catch (e) {
      if (!(e instanceof ApiError && /already exists|ya existe/i.test(e.message))) throw e;
    }
    const range = encodeURIComponent(`'${title.replace(/'/g, "''")}'!A1`);
    await api(`${this.base}/values/${range}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [headers] }) });
  }
}
