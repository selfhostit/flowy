import { toDay, toIso } from './cycle';
import {
  customLabelMax,
  moods,
  symptoms,
  type CustomSymptom,
  type DayFields,
  type Flow,
} from './log';
import { fieldsOf } from './offline';

// Reads day logs from a file another tracker (or Flowy itself) exported: a CSV,
// TSV or JSON list with a date on each row, or a diary with one dated entry a
// line. Columns are found by their names, so a file only needs a date, and
// anything else it has is kept where Flowy has a place for it.

export interface Imported {
  /** One entry per day, oldest first. */
  days: DayFields[];
  /** Rows without a date that could be read. */
  skipped: number;
}

type Row = Record<string, string>;

/** What a column could hold, by its name with only letters and digits kept. */
const columns = {
  date: ['date', 'day', 'datum', 'fecha', 'startdate', 'start', 'periodstart', 'from', 'begin'],
  end: ['enddate', 'end', 'periodend', 'to', 'until'],
  flow: [
    'flow',
    'menstruation',
    'menstrualflow',
    'flowintensity',
    'bleeding',
    'intensity',
    'period',
  ],
  symptoms: ['symptoms', 'symptom'],
  custom: ['customsymptoms', 'ownsymptoms', 'othersymptoms'],
  moods: ['moods', 'mood', 'feelings', 'emotions'],
  sex: ['sex', 'intercourse', 'sexualactivity'],
  pill: ['pill', 'contraceptive', 'birthcontrol'],
  temperature: ['temperature', 'temp', 'bbt', 'basaltemperature', 'basalbodytemperature'],
  weight: ['weight'],
  notes: ['notes', 'note', 'comment', 'comments', 'diary'],
};

type Column = keyof typeof columns;

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Reads a file's text; throws an Error with a message for people when it can't. */
export function parseImport(text: string, periodLength = 5): Imported {
  text = text.replace(/^\uFEFF/, '').trim();
  if (isDiary(text)) return diaryDays(text, periodLength);
  const rows = /^[[{]/.test(text) ? jsonRows(text) : csvRows(text);
  if (!rows.length) throw new Error('The file has no rows.');

  const names = new Set(rows.flatMap((r) => Object.keys(r)));
  const find = (c: Column) => {
    for (const want of columns[c]) for (const n of names) if (key(n) === want) return n;
    return undefined;
  };
  const col = Object.fromEntries(Object.keys(columns).map((c) => [c, find(c as Column)])) as Record<
    Column,
    string | undefined
  >;
  if (!col.date) throw new Error('No date column found. The first row should name the columns.');

  const readDate = dateReader(rows.map((r) => r[col.date!] ?? ''));
  const byDate = new Map<string, DayFields>();
  const add = (fields: Partial<DayFields> & { date: string }) =>
    byDate.set(fields.date, merge(byDate.get(fields.date), fieldsOf(fields)));

  // a file with nothing but dates lists period days, or the days periods started
  const onlyDates = !Object.entries(col).some(([c, n]) => n && c !== 'date' && c !== 'end');
  const dates = rows.map((r) => readDate(r[col.date!] ?? '')).filter((d) => d !== null);
  const days = [...new Set(dates)].map(toDay).sort((a, b) => a - b);
  const starts = onlyDates && !col.end && !days.some((d, i) => i && d - days[i - 1] === 1);

  let skipped = 0;
  for (const row of rows) {
    const date = readDate(row[col.date] ?? '');
    if (!date) {
      if (Object.values(row).some((v) => v.trim())) skipped++;
      continue;
    }
    const end = col.end ? readDate(row[col.end] ?? '') : null;
    const flow = col.flow ? readFlow(row[col.flow] ?? '') : onlyDates || col.end ? 'medium' : '';
    if (end || starts) {
      // a period from its first to its last day
      const last = end ? toDay(end) : toDay(date) + periodLength - 1;
      for (let d = toDay(date); d <= last && d - toDay(date) < 15; d++)
        add({ date: toIso(d), flow });
    }
    const [known, other] = readList(col.symptoms ? (row[col.symptoms] ?? '') : '', symptoms);
    const custom = [...other, ...(col.custom ? split(row[col.custom] ?? '') : [])];
    const [mood, otherMoods] = readList(col.moods ? (row[col.moods] ?? '') : '', moods);
    const notes = [
      col.notes ? (row[col.notes] ?? '').trim() : '',
      ...otherMoods.map((m) => `Mood: ${m}`),
    ];
    add({
      date,
      flow,
      symptoms: known,
      custom_symptoms: [...new Set(custom)]
        .slice(0, 20)
        .map((label) => ({ label: label.slice(0, customLabelMax), icon: '✨' })),
      moods: mood,
      sex: col.sex ? readSex(row[col.sex] ?? '') : '',
      pill: col.pill ? isYes(row[col.pill] ?? '') : false,
      temperature: col.temperature ? readTemperature(row[col.temperature] ?? '') : 0,
      weight: col.weight ? readNumber(row[col.weight] ?? '', 0, 500) : 0,
      notes: notes.filter(Boolean).join('\n').slice(0, 2000),
    });
  }
  const out = [...byDate.values()]
    .filter((d) => !isBlank(d))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!out.length) throw new Error('Nothing to import: no row has a date Flowy can read.');
  return { days: out, skipped };
}

/** A day already logged with an imported one: what's logged stays, the import fills the gaps. */
export function merge(logged: DayFields | undefined, imported: DayFields): DayFields {
  if (!logged) return imported;
  const custom = [...logged.custom_symptoms];
  for (const s of imported.custom_symptoms)
    if (!custom.some((c) => c.label.toLowerCase() === s.label.toLowerCase())) custom.push(s);
  const notes = logged.notes.includes(imported.notes)
    ? logged.notes
    : [logged.notes, imported.notes].filter(Boolean).join('\n');
  return {
    date: logged.date,
    flow: logged.flow || imported.flow,
    symptoms: [...new Set([...logged.symptoms, ...imported.symptoms])],
    custom_symptoms: custom.slice(0, 20),
    moods: [...new Set([...logged.moods, ...imported.moods])],
    sex: logged.sex || imported.sex,
    pill: logged.pill || imported.pill,
    temperature: logged.temperature || imported.temperature,
    weight: logged.weight || imported.weight,
    notes: notes.slice(0, 2000),
  };
}

const isBlank = (d: DayFields) =>
  !d.flow &&
  !d.symptoms.length &&
  !d.custom_symptoms.length &&
  !d.moods.length &&
  !d.sex &&
  !d.pill &&
  !d.temperature &&
  !d.weight &&
  !d.notes;

/** A diary export: one entry a line, the date, a tab, then what was noted. */
const diaryLine = /^([^\t]+)\t(.*)$/;

function isDiary(text: string): boolean {
  const m = diaryLine.exec(text.split('\n', 1)[0].trim());
  return !!m && !!dateReader([m[1]])(m[1]);
}

/**
 * Reads entries such as "Period Starts", "Period Ends", "Symptoms:++Flow,Acne;+Fatigue;"
 * (more pluses for stronger), "Moods:Calm", "Note:...", "Medicine:..." and
 * "Intercourse(With Condom)". Days between a period's start and end are period
 * days; flow logged on a day says how heavy.
 */
function diaryDays(text: string, periodLength: number): Imported {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const readDate = dateReader(lines.map((l) => l.split('\t', 1)[0]));
  const byDate = new Map<string, DayFields>();
  const day = (date: string) => {
    if (!byDate.has(date)) byDate.set(date, fieldsOf({ date }));
    return byDate.get(date)!;
  };
  const note = (d: DayFields, text: string) => {
    if (text && !d.notes.split('\n').includes(text))
      d.notes = [d.notes, text].filter(Boolean).join('\n');
  };
  const flows = new Map<string, Flow>();
  const named = new Map<string, string[]>();
  const period = (from: number, to: number) => {
    for (let d = from; d <= to && d - from < 15; d++) {
      const l = day(toIso(d));
      l.flow ||= 'medium';
    }
  };

  let start: number | null = null;
  let skipped = 0;
  for (const line of lines) {
    const m = diaryLine.exec(line.trim());
    const date = m && readDate(m[1]);
    if (!m || !date) {
      skipped++;
      continue;
    }
    const entry = m[2].trim();
    const [kind, value = ''] = entry.split(/:(.*)/s).map((p) => p.trim());
    const d = day(date);
    switch (key(kind)) {
      case 'periodstarts':
        if (start !== null) period(start, start + periodLength - 1);
        start = toDay(date);
        break;
      case 'periodends':
        if (start !== null && toDay(date) >= start) period(start, toDay(date));
        else period(toDay(date), toDay(date));
        start = null;
        break;
      case 'symptoms':
        for (const [, pluses, list] of value.matchAll(/(\++)([^;]*)/g)) {
          for (const name of split(list)) {
            if (key(name) === 'flow') {
              const level: Flow =
                pluses.length >= 3 ? 'heavy' : pluses.length === 2 ? 'medium' : 'light';
              flows.set(date, level);
            } else if (key(name) === 'spotting') flows.has(date) || flows.set(date, 'spotting');
            else named.set(date, [...(named.get(date) ?? []), name]);
          }
        }
        break;
      case 'moods': {
        const [known, other] = readList(value, moods);
        d.moods = [...new Set([...d.moods, ...known])];
        for (const o of other) note(d, `Mood: ${o}`);
        break;
      }
      case 'note':
      case 'notes':
        note(d, value);
        break;
      case 'medicine':
      case 'medicines':
      case 'pill':
        note(d, `Medicine: ${split(value).join(', ')}`);
        break;
      case 'weight':
        d.weight = readNumber(value, 0, 500);
        break;
      case 'temperature':
        d.temperature = readTemperature(value);
        break;
      default:
        if (key(kind).startsWith('intercourse') || key(kind).startsWith('sex'))
          d.sex = readSex(entry) || 'unprotected';
        else note(d, entry);
    }
  }
  // a period that hasn't ended yet
  if (start !== null) period(start, start + periodLength - 1);

  for (const [date, flow] of flows) {
    const d = day(date);
    // spotting on a day inside a period doesn't make it lighter
    if (flow !== 'spotting' || !d.flow) d.flow = flow;
  }
  for (const [date, names] of named) {
    const d = day(date);
    const [known, other] = readList(names.join(';'), symptoms);
    d.symptoms = known;
    d.custom_symptoms = other
      .slice(0, 20)
      .map((label) => ({ label: label.slice(0, customLabelMax), icon: '✨' }));
  }
  const days = [...byDate.values()]
    .map((d) => ({ ...d, notes: d.notes.slice(0, 2000) }))
    .filter((d) => !isBlank(d))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!days.length) throw new Error('Nothing to import: no line has a date Flowy can read.');
  return { days, skipped };
}

function csvRows(text: string): Row[] {
  const header = text.split('\n', 1)[0];
  const sep = ['\t', ';', ','].reduce((best, s) =>
    header.split(s).length > header.split(best).length ? s : best,
  );
  const cells: string[][] = [[]];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') cell += text[i++];
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && !cell) quoted = true;
    else if (ch === sep) {
      cells[cells.length - 1].push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      cells[cells.length - 1].push(cell);
      cells.push([]);
      cell = '';
    } else cell += ch;
  }
  cells[cells.length - 1].push(cell);
  const [names, ...body] = cells;
  return body.map((r) => Object.fromEntries(names.map((n, i) => [n.trim(), r[i] ?? ''])));
}

function jsonRows(text: string): Row[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('The file looks like JSON but could not be read.');
  }
  // the list of days may be wrapped in an object, such as {"data": [...]}
  const list = (v: unknown): unknown[] | undefined => {
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object')
      for (const inner of Object.values(v)) {
        const found = list(inner);
        if (found?.some((x) => x && typeof x === 'object')) return found;
      }
  };
  return (list(data) ?? [])
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x) =>
      Object.fromEntries(
        Object.entries(x).map(([k, v]) => [
          k,
          Array.isArray(v)
            ? v.map((i) => (i && typeof i === 'object' ? (i as CustomSymptom).label : i)).join(';')
            : v == null
              ? ''
              : String(v),
        ]),
      ),
    );
}

/**
 * Reads dates as YYYY-MM-DD. Day and month in dates like 03/04/2025 are told
 * apart by looking at every date in the file; when none has a part over 12,
 * the day is taken to come first.
 */
function dateReader(all: string[]): (s: string) => string | null {
  const short = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/;
  let monthFirst = false;
  for (const s of all) {
    const m = short.exec(s.trim());
    if (m && +m[1] > 12) break;
    if (m && +m[2] > 12) {
      monthFirst = true;
      break;
    }
  }
  const iso = (y: number, m: number, d: number) => {
    const date = new Date(Date.UTC(y < 100 ? 2000 + y : y, m - 1, d));
    if (date.getUTCMonth() !== m - 1 || y < 1900 || y > 2200) return null;
    return date.toISOString().slice(0, 10);
  };
  return (raw) => {
    const s = raw.trim();
    let m = /^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/.exec(s);
    if (m) return iso(+m[1], +m[2], +m[3]);
    m = short.exec(s);
    if (m) return monthFirst ? iso(+m[3], +m[1], +m[2]) : iso(+m[3], +m[2], +m[1]);
    m = /^([a-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})/i.exec(s);
    if (m && months.includes(m[1].toLowerCase()))
      return iso(+m[3], months.indexOf(m[1].toLowerCase()) / 3 + 1, +m[2]);
    if (/^\d{10}(\d{3})?$/.test(s)) {
      // a timestamp, in seconds or milliseconds
      const t = new Date(s.length === 10 ? +s * 1000 : +s);
      return iso(t.getFullYear(), t.getMonth() + 1, t.getDate());
    }
    if (/[a-z]/i.test(s) && !isNaN(Date.parse(s))) {
      const t = new Date(s);
      return iso(t.getFullYear(), t.getMonth() + 1, t.getDate());
    }
    return null;
  };
}

const months = 'janfebmaraprmayjunjulaugsepoctnovdec';

function readFlow(raw: string): Flow {
  const s = key(raw);
  if (!s || ['0', 'no', 'none', 'false', 'n'].includes(s)) return '';
  if (s.includes('spot')) return 'spotting';
  if (['1', 'light', 'low', 'little'].includes(s) || s.includes('light')) return 'light';
  if (['3', '4', '5', 'heavy', 'high', 'veryheavy', 'strong'].includes(s) || s.includes('heavy'))
    return 'heavy';
  return 'medium';
}

const isYes = (raw: string) => !['', '0', 'no', 'false', 'n', 'none'].includes(key(raw));

function readSex(raw: string): DayFields['sex'] {
  const s = key(raw);
  if (!isYes(raw)) return '';
  if (s.includes('unprotected') || s.includes('without')) return 'unprotected';
  if (s.includes('protected') || s.includes('condom')) return 'protected';
  return 'unprotected';
}

function readNumber(raw: string, min: number, max: number): number {
  const n = parseFloat(raw.replace(',', '.'));
  return n >= min && n <= max ? Math.round(n * 100) / 100 : 0;
}

/** Temperatures in °F are turned into °C. */
function readTemperature(raw: string): number {
  let n = parseFloat(raw.replace(',', '.'));
  if (n > 90 && n < 110) n = ((n - 32) * 5) / 9;
  return readNumber(String(n), 34, 43);
}

/** Other names for the symptoms and moods Flowy has. */
const aliases: Record<string, string> = {
  abdominalcramps: 'cramps',
  periodcramps: 'cramps',
  migraine: 'headache',
  migraines: 'headache',
  backpain: 'backache',
  lowbackpain: 'backache',
  breastsensitivity: 'tender_breasts',
  breasttenderness: 'tender_breasts',
  sorebreasts: 'tender_breasts',
  pimples: 'acne',
  tiredness: 'fatigue',
  sleeplessness: 'insomnia',
  stressed: 'anxious',
  worried: 'anxious',
  nervous: 'anxious',
  tense: 'anxious',
  cranky: 'irritable',
  grumpy: 'irritable',
  angry: 'irritable',
  frustrated: 'irritable',
  exhausted: 'tired',
  sleepy: 'tired',
  emotional: 'sensitive',
  depressed: 'sad',
  relaxed: 'calm',
};

/** Splits a cell into the options Flowy knows and the rest, matching labels too. */
function readList(raw: string, options: { value: string; label: string }[]): [string[], string[]] {
  const find = (s: string) =>
    options.find(
      (o) => key(o.value) === key(s) || key(o.label) === key(s) || aliases[key(s)] === o.value,
    )?.value;
  let parts = split(raw);
  // Flowy's own export separates values with spaces
  if (parts.length === 1 && parts[0].split(/\s+/).every(find)) parts = parts[0].split(/\s+/);
  const known: string[] = [];
  const other: string[] = [];
  for (const p of parts) {
    const v = find(p);
    if (v) known.includes(v) || known.push(v);
    else other.includes(p) || other.push(p);
  }
  return [known, other];
}

const split = (raw: string) =>
  raw
    .split(/[;,|\n]/)
    .map((p) => p.trim())
    .filter(Boolean);
