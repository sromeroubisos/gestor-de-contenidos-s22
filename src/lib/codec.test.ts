import { describe, expect, it } from "vitest";
import { buildWrites, changedColumns, nextId, rowToPost, safeText, type SheetCtx } from "./codec";
import { parseDate, parseTime } from "./dates";
import { parseConfig } from "./provider";
import { columnLetter, mapColumns } from "./schema";
import { DERIVED_FIELDS } from "./types";

// Real headers of 📋 CONTENIDOS / 🗄️ HISTÓRICO (row 1).
const HEADERS = [
  "ID", "Marca", "Fecha", "Día", "Mes", "Año", "Semana", "Hora", "Plataforma", "Tipo", "Tema / Título", "Copy",
  "Estado", "Responsable", "Prioridad", "Link / Asset", "Sponsors", "Observaciones", "Origen", "Inicio (fecha + hora)", "Franja horaria",
];
const map = mapColumns(HEADERS);
// CONTENIDOS: D,E,F,G,T,U are ARRAYFORMULAs.
const contenidos: SheetCtx = { title: "📋 CONTENIDOS", source: "contenidos", headers: HEADERS, map, protectedCols: new Set([3, 4, 5, 6, 19, 20]) };
const historico: SheetCtx = { title: "🗄️ HISTÓRICO", source: "historico", headers: HEADERS, map, protectedCols: new Set() };

// G22-0031 as stored in HISTÓRICO (date as serial 46042 = 20/01/2026).
const ROW = ["G22-0031", "Corner Corto 22", 46042, "Martes", "Enero", 2026, 4, "", "", "Placa informativa", "Árbitros argentinos", "Copy…", "Publicado", "", "", "", "Nucleo Fit, Lila, XPR", "", "Corner Corto 22 · fila 7", "", "Sin hora"];

describe("schema", () => {
  it("maps every real column", () => {
    expect(Object.keys(map)).toHaveLength(21);
    expect(map.title).toBe(10);
    expect(map.year).toBe(5);
    expect(columnLetter(map.slot!)).toBe("U");
  });
});

describe("rowToPost", () => {
  it("parses a real row", () => {
    const p = rowToPost(ROW, 32, historico)!;
    expect(p.id).toBe("G22-0031");
    expect(p.date).toBe("2026-01-20");
    expect(p.sponsors).toEqual(["Nucleo Fit", "Lila", "XPR"]);
    expect(p.source).toBe("historico");
  });
  it("keeps posts apart when the same ID exists in CONTENIDOS and HISTÓRICO", () => {
    const a = rowToPost(["G22-0001", "Salida de 22", "", "", "", "", "", "", "", "", "Nuevo", "", "Pendiente"], 2, contenidos)!;
    const b = rowToPost(["G22-0001", "Salida de 22", "", "", "", "", "", "", "", "", "Viejo", "", "Publicado"], 2, historico)!;
    expect(a.key).not.toBe(b.key);
  });
  it("tolerates the extra note columns at the end of HISTÓRICO's header", () => {
    expect(Object.keys(mapColumns([...HEADERS, "", "Publicaciones previas migradas desde las hojas originales…"]))).toHaveLength(21);
  });
  it("skips empty rows", () => {
    expect(rowToPost(["", "", "", "Lunes"], 5, contenidos)).toBeNull();
  });
});

describe("buildWrites", () => {
  const post = rowToPost(ROW, 32, historico)!;
  it("never writes formula columns in CONTENIDOS", () => {
    const { writes } = buildWrites({ ...post, source: "contenidos" }, { date: "2026-09-24", time: "10:00", status: "Revisar" }, contenidos);
    const cols = writes.map((w) => w.col);
    DERIVED_FIELDS.forEach((f) => expect(cols).not.toContain(map[f]));
    expect(writes).toContainEqual({ col: map.date, value: "2026-09-24" });
    expect(writes).toContainEqual({ col: map.time, value: "10:00" });
    expect(writes).toContainEqual({ col: map.status, value: "Revisar" });
  });
  it("keeps derived plain values consistent in HISTÓRICO", () => {
    const { writes } = buildWrites(post, { date: "2026-09-24", time: "10:00" }, historico);
    expect(writes).toContainEqual({ col: map.day, value: "Jueves" });
    expect(writes).toContainEqual({ col: map.month, value: "Septiembre" });
    expect(writes).toContainEqual({ col: map.week, value: 39 });
    expect(writes).toContainEqual({ col: map.slot, value: "09:00–12:00" });
  });
  it("only writes changed fields and logs old → new", () => {
    const { writes, changes } = buildWrites(post, { status: "Publicado", owner: "Justina" }, historico);
    expect(writes).toEqual([{ col: map.owner, value: "Justina" }]);
    expect(changes).toEqual([{ field: "Responsable", oldValue: "", newValue: "Justina" }]);
  });
  it("neutralizes formula injection", () => {
    expect(safeText("=IMPORTXML(1)")).toBe("'=IMPORTXML(1)");
    expect(buildWrites(post, { title: "=1+1" }, historico).writes[0].value).toBe("'=1+1");
  });
});

describe("conflicts", () => {
  it("detects a change made in the Sheet", () => {
    const before = rowToPost(ROW, 32, historico)!;
    const now = rowToPost(ROW.map((v, i) => (i === 12 ? "Revisar" : v)), 32, historico)!;
    expect(changedColumns(before, now, historico)).toEqual(["Estado"]);
  });
  it("treats the same date in another format as unchanged", () => {
    const before = rowToPost(ROW, 32, historico)!;
    const now = rowToPost(ROW.map((v, i) => (i === 2 ? "20/01/2026" : v)), 32, historico)!;
    expect(changedColumns(before, now, historico)).toEqual([]);
  });
});

describe("ids & dates", () => {
  it("next id is unique across tabs", () => {
    expect(nextId(["G22-0001", "G22-0054", "", "ID"])).toBe("G22-0055");
    expect(nextId([])).toBe("G22-0001");
  });
  it("parses dates and times", () => {
    expect(parseDate("23/09/2026")).toBe("2026-09-23");
    expect(parseTime(0.4166666667)).toBe("10:00");
    expect(parseTime("9:30")).toBe("09:30");
  });
});

describe("parseConfig", () => {
  it("reads gapped config columns by header", () => {
    const rows = [
      ["Marcas", "Emoji", "Color", "", "Plataformas", "", "Tipos", "", "Estados", "¿Cuenta como pendiente?", "", "Prioridades", "", "Responsables"],
      ["Salida de 22", "🏉", "#00A365", "", "Instagram", "", "Post", "", "Idea", "Sí", "", "Alta", "", "JUSTINA VAZQUEZ CORONADO"],
      ["Corner Corto 22", "🏑", "#7B3FE4", "", "TikTok", "", "Reel", "", "Publicado", "No", "", "Media", "", "murivaudagna@gmail.com"],
    ];
    const l = parseConfig(rows, []);
    expect(l.brands[1]).toEqual({ name: "Corner Corto 22", emoji: "🏑", color: "#7B3FE4" });
    expect(l.statuses).toEqual([{ name: "Idea", countsAsPending: true }, { name: "Publicado", countsAsPending: false }]);
    expect(l.owners).toEqual(["JUSTINA VAZQUEZ CORONADO", "murivaudagna@gmail.com"]);
    expect(l.platforms).toEqual(["Instagram", "TikTok"]);
  });
});
