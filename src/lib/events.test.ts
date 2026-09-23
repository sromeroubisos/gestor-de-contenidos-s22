import { describe, expect, it } from "vitest";
import {
  EVENT_HEADERS,
  eventToRow,
  formatTasks,
  formatTeam,
  googleCalendarUrl,
  mapEventColumns,
  parseTasks,
  parseTeam,
  rowToEvent,
  toICS,
  type TeamEvent,
} from "./events";

const map = mapEventColumns(EVENT_HEADERS);

const EVENT: TeamEvent = {
  key: "EV-1", id: "EV-1", rowHint: 2, type: "Partido", title: "CASI vs SIC", date: "2026-09-27", time: "15:30", endTime: null,
  place: "San Isidro", brand: "Salida de 22", team: [{ name: "Santi", role: "Fotos" }, { name: "Caro", role: "" }],
  tasks: [{ text: "Placa previa", done: false, owner: "Santi" }, { text: "Llevar trípode", done: true, owner: "" }],
  status: "Confirmado", notes: "Llegar 14:30", createdBy: "Santi", updatedAt: "23/09/2026 10:00", snapshot: "",
};

describe("team and tasks", () => {
  it("round-trips the team", () => {
    expect(formatTeam(EVENT.team)).toBe("Santi (Fotos), Caro");
    expect(parseTeam("Santi (Fotos), Caro")).toEqual(EVENT.team);
  });

  it("round-trips the checklist and accepts hand-written variants", () => {
    const text = formatTasks(EVENT.tasks);
    expect(text).toBe("☐ Placa previa — Santi\n☑ Llevar trípode");
    expect(parseTasks(text)).toEqual(EVENT.tasks);
    expect(parseTasks("[x] Hecho\nSin marca")).toEqual([
      { text: "Hecho", done: true, owner: "" },
      { text: "Sin marca", done: false, owner: "" },
    ]);
  });
});

describe("row ↔ event", () => {
  it("writes text-forced cells in header order and reads them back", () => {
    const row = eventToRow(EVENT, map, true);
    expect(row).toHaveLength(EVENT_HEADERS.length);
    expect(row[3]).toBe("'2026-09-27");
    expect(row[5]).toBe(""); // empty end time stays empty, no stray apostrophe
    const back = rowToEvent(row, 2, map)!;
    expect(back.snapshot).toBe(rowToEvent(eventToRow(EVENT, map, false), 2, map)!.snapshot);
    expect({ ...back, snapshot: "" }).toEqual(EVENT);
  });

  it("reads dates and times typed in the Sheet as serials", () => {
    const row = eventToRow(EVENT, map, false) as (string | number)[];
    row[3] = 46292; // 27/09/2026
    row[4] = 0.6458333333; // 15:30
    const e = rowToEvent(row, 2, map)!;
    expect(e.date).toBe("2026-09-27");
    expect(e.time).toBe("15:30");
  });

  it("maps reordered columns by header", () => {
    const headers = ["Título", "ID", "Fecha"];
    const e = rowToEvent(["Reunión", "EV-2", "2026-10-01"], 5, mapEventColumns(headers))!;
    expect(e).toMatchObject({ id: "EV-2", title: "Reunión", date: "2026-10-01", type: "Otro" });
  });

  it("skips empty rows", () => {
    expect(rowToEvent(["", "", ""], 3, map)).toBeNull();
  });
});

describe("calendar export", () => {
  it("builds a Google Calendar link with a default 2-hour span", () => {
    const url = new URL(googleCalendarUrl(EVENT, "America/Argentina/Buenos_Aires")!);
    expect(url.searchParams.get("dates")).toBe("20260927T153000/20260927T173000");
    expect(url.searchParams.get("location")).toBe("San Isidro");
    expect(url.searchParams.get("ctz")).toBe("America/Argentina/Buenos_Aires");
  });

  it("treats untimed events as all-day and crosses midnight when needed", () => {
    expect(new URL(googleCalendarUrl({ ...EVENT, time: null })!).searchParams.get("dates")).toBe("20260927/20260928");
    expect(new URL(googleCalendarUrl({ ...EVENT, time: "23:00", endTime: "01:00" })!).searchParams.get("dates")).toBe(
      "20260927T230000/20260928T010000",
    );
    expect(googleCalendarUrl({ ...EVENT, date: null })).toBeNull();
  });

  it("exports ICS without cancelled events and with escaped text", () => {
    const ics = toICS([EVENT, { ...EVENT, id: "EV-X", status: "Cancelado" }], { timeZone: "America/Argentina/Buenos_Aires", now: new Date(0) });
    expect(ics).toContain("DTSTART;TZID=America/Argentina/Buenos_Aires:20260927T153000");
    expect(ics).toContain("LOCATION:San Isidro");
    expect(ics).not.toContain("EV-X");
    expect(ics.split("\r\n").every((l) => l.length <= 75)).toBe(true);
    expect(ics).toContain("\\n"); // newlines inside DESCRIPTION are escaped
  });
});
