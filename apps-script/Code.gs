/**
 * GRUPO 22 — Content Manager · puente Apps Script
 *
 * Se pega en el Sheet: Extensiones → Apps Script → reemplazar Code.gs → Guardar →
 * Implementar → Nueva implementación → Tipo: Aplicación web →
 *   Ejecutar como: Yo · Quién tiene acceso: Cualquier persona → Implementar.
 * Copiar la URL (termina en /exec) y pegarla en la app (Configuración).
 *
 * Solo lee/escribe celdas puntuales que pide la app. No borra filas, columnas ni pestañas.
 */
const CLAVE = 'PEGAR_CLAVE_AQUI';

function doGet(e) {
  const p = (e && e.parameter) || {};
  // Feed de eventos del equipo para suscribirse desde Google Calendar: <URL>/exec?ics=1&key=CLAVE
  if (p.ics) {
    if (p.key !== CLAVE) return ContentService.createTextOutput('Clave inválida');
    return ContentService.createTextOutput(ics_(SpreadsheetApp.getActiveSpreadsheet())).setMimeType(ContentService.MimeType.ICAL);
  }
  return out_({ ok: true, app: 'G22 Content Manager', sheet: SpreadsheetApp.getActiveSpreadsheet().getName() });
}

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    if (req.key !== CLAVE) return out_({ error: { code: 403, message: 'Clave inválida' } });
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    switch (req.op) {
      case 'meta': return out_(meta_(ss));
      case 'batchGet':
        return out_({ valueRanges: req.ranges.map(function (r) { return { range: r, values: read_(ss, r, req.render) }; }) });
      case 'batchUpdate': return out_(locked_(function () { return write_(ss, req.data); }));
      case 'append': return out_(locked_(function () { return append_(ss, req.sheet, req.values); }));
      case 'addSheet': return out_(locked_(function () { return addSheet_(ss, req.title, req.headers); }));
      default: return out_({ error: { code: 400, message: 'Operación desconocida: ' + req.op } });
    }
  } catch (err) {
    return out_({ error: { code: 500, message: String(err && err.message || err) } });
  }
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function locked_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { const r = fn(); SpreadsheetApp.flush(); return r; } finally { lock.releaseLock(); }
}

function meta_(ss) {
  return {
    title: ss.getName(),
    locale: ss.getSpreadsheetLocale(),
    timeZone: ss.getSpreadsheetTimeZone(),
    sheets: ss.getSheets().map(function (s) {
      return { sheetId: s.getSheetId(), title: s.getName(), index: s.getIndex() - 1, hidden: s.isSheetHidden() };
    }),
  };
}

/** Fecha → número de serie de Sheets (días desde 30/12/1899), en la zona horaria del Sheet. */
function serial_(d, tz) {
  const p = Utilities.formatDate(d, tz, 'yyyy-MM-dd-HH-mm-ss').split('-').map(Number);
  return (Date.UTC(p[0], p[1] - 1, p[2]) - Date.UTC(1899, 11, 30)) / 86400000 + (p[3] * 3600 + p[4] * 60 + p[5]) / 86400;
}

/** Igual que la API: sin filas/celdas vacías al final. */
function trim_(rows) {
  const out = rows.map(function (r) {
    let n = r.length;
    while (n > 0 && (r[n - 1] === '' || r[n - 1] === null)) n--;
    return r.slice(0, n);
  });
  let m = out.length;
  while (m > 0 && out[m - 1].length === 0) m--;
  return out.slice(0, m);
}

function read_(ss, a1, render) {
  const range = ss.getRange(a1);
  if (render === 'FORMATTED') return trim_(range.getDisplayValues());
  const tz = ss.getSpreadsheetTimeZone();
  const values = range.getValues().map(function (r) {
    return r.map(function (c) { return c instanceof Date ? serial_(c, tz) : c; });
  });
  if (render === 'FORMULA') {
    const f = range.getFormulas();
    return trim_(values.map(function (r, i) { return r.map(function (c, j) { return f[i][j] || c; }); }));
  }
  return trim_(values);
}

/** Escritura "como si la tipeara un usuario". Fechas ISO se convierten a fecha real. */
function write_(ss, data) {
  const tz = ss.getSpreadsheetTimeZone();
  let n = 0;
  data.forEach(function (d) {
    const range = ss.getRange(d.range);
    range.setValues(d.values.map(function (r) { return r.map(function (v) { return toCell_(v, tz); }); }));
    n += d.values.length * d.values[0].length;
  });
  return { totalUpdatedCells: n };
}

function toCell_(v, tz) {
  if (typeof v !== 'string') return v;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return Utilities.parseDate(v, tz, 'yyyy-MM-dd');
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(v)) return Utilities.parseDate(v, tz, 'yyyy-MM-dd HH:mm');
  return v;
}

/** Filas de texto literal (historial/comentarios): nunca se interpretan como fórmulas. */
function append_(ss, title, rows) {
  const sh = ss.getSheetByName(title);
  if (!sh) throw new Error('No existe la pestaña ' + title);
  const width = Math.max.apply(null, rows.map(function (r) { return r.length; }));
  const vals = rows.map(function (r) {
    const row = r.map(function (v) { return /^[=+\-@]/.test(String(v)) ? "'" + v : v; });
    while (row.length < width) row.push('');
    return row;
  });
  sh.getRange(sh.getLastRow() + 1, 1, vals.length, width).setNumberFormat('@').setValues(vals);
  return {};
}

function addSheet_(ss, title, headers) {
  let sh = ss.getSheetByName(title);
  if (!sh) sh = ss.insertSheet(title, ss.getSheets().length);
  if (sh.getLastRow() === 0) sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  return {};
}

// ---------- Eventos del equipo → iCalendar (solo lectura) ----------

function ics_(ss) {
  const tz = ss.getSpreadsheetTimeZone();
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Grupo 22//Content Manager//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Grupo 22 · Eventos', 'X-WR-TIMEZONE:' + tz];
  const sh = ss.getSheetByName('APP_EVENTOS');
  if (sh && sh.getLastRow() > 1) {
    const range = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn());
    const values = range.getValues();
    const shown = range.getDisplayValues();
    const head = values[0].map(function (h) { return String(h).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); });
    const col = function (name) { return head.indexOf(name); };
    const c = { id: col('id'), type: col('tipo'), title: col('titulo'), date: col('fecha'), time: col('hora'), end: col('hora fin'),
      place: col('lugar'), brand: col('marca'), team: col('equipo'), tasks: col('tareas'), status: col('estado'), notes: col('notas') };
    const stamp = Utilities.formatDate(new Date(), 'UTC', "yyyyMMdd'T'HHmmss'Z'");
    for (let r = 1; r < values.length; r++) {
      const get = function (k) { return c[k] < 0 ? '' : String(shown[r][c[k]]).trim(); };
      const date = icsDate_(c.date < 0 ? '' : values[r][c.date], tz);
      if (!get('id') || !date || /^cancel/i.test(get('status'))) continue;
      const start = icsTime_(get('time'));
      const icon = { Partido: '🏉', Cobertura: '🎥', 'Grabación': '🎬', 'Reunión': '💬', Viaje: '🚐' }[get('type')] || '📌';
      lines.push('BEGIN:VEVENT', 'UID:' + get('id') + '@grupo22-cm', 'DTSTAMP:' + stamp);
      if (!start) {
        lines.push('DTSTART;VALUE=DATE:' + date, 'DTEND;VALUE=DATE:' + shiftDate_(date, 1));
      } else {
        let end = icsTime_(get('end'));
        let endDate = date;
        if (!end) {
          const mins = Number(start.slice(0, 2)) * 60 + Number(start.slice(2, 4)) + 120;
          end = pad2_(Math.floor(mins / 60) % 24) + pad2_(mins % 60) + '00';
          if (mins >= 1440) endDate = shiftDate_(date, 1);
        } else if (end <= start) endDate = shiftDate_(date, 1);
        lines.push('DTSTART;TZID=' + tz + ':' + date + 'T' + start, 'DTEND;TZID=' + tz + ':' + endDate + 'T' + end);
      }
      const details = [get('type') + (get('brand') ? ' · ' + get('brand') : '')];
      if (get('team')) details.push('', 'Van: ' + get('team'));
      if (get('tasks')) details.push('', 'Tareas:', get('tasks'));
      if (get('notes')) details.push('', get('notes'));
      lines.push('SUMMARY:' + icsEsc_(icon + ' ' + (get('title') || get('type'))), 'DESCRIPTION:' + icsEsc_(details.join('\n')));
      if (get('place')) lines.push('LOCATION:' + icsEsc_(get('place')));
      if (/confirmar/i.test(get('status'))) lines.push('STATUS:TENTATIVE');
      lines.push('END:VEVENT');
    }
  }
  lines.push('END:VCALENDAR');
  return lines.map(icsFold_).join('\r\n') + '\r\n';
}

function pad2_(n) { return (n < 10 ? '0' : '') + n; }

/** Fecha real, ISO (2026-09-27) o dd/mm/yyyy → yyyyMMdd. */
function icsDate_(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyyMMdd');
  const s = String(v).trim().replace(/^'/, '');
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + pad2_(+m[2]) + pad2_(+m[3]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? m[3] + pad2_(+m[2]) + pad2_(+m[1]) : '';
}

/** "15:30" o "15:30:00" → 153000. */
function icsTime_(s) {
  const m = String(s).replace(/^'/, '').match(/^(\d{1,2}):(\d{2})/);
  return m && +m[1] < 24 ? pad2_(+m[1]) + m[2] + '00' : '';
}

function shiftDate_(yyyymmdd, days) {
  const d = new Date(Date.UTC(+yyyymmdd.slice(0, 4), +yyyymmdd.slice(4, 6) - 1, +yyyymmdd.slice(6, 8) + days));
  return Utilities.formatDate(d, 'UTC', 'yyyyMMdd');
}

function icsEsc_(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function icsFold_(line) {
  const out = [];
  while (line.length > 75) { out.push(line.slice(0, 75)); line = ' ' + line.slice(75); }
  out.push(line);
  return out.join('\r\n');
}
