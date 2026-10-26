// Cycle math for the today screen, the calendar and insights. backend/cycle does
// the same for reminders: keep the two in step.

/** A date as whole days since 1970-01-01, so adding days never trips over time zones. */
export type Day = number;

const MS_PER_DAY = 86_400_000;

export function toDay(iso: string): Day {
  return Math.round(Date.parse(iso + 'T00:00:00Z') / MS_PER_DAY);
}

export function toIso(day: Day): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

/** A Date to format with `timeZone: 'UTC'`. */
export function toDate(day: Day): Date {
  return new Date(day * MS_PER_DAY);
}

/** Today's date in this device's time zone. */
export function today(now = new Date()): Day {
  return Math.round(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / MS_PER_DAY);
}

export interface Settings {
  cycleLength: number;
  periodLength: number;
  /** Days from ovulation to the next period; about 14 for most people. */
  lutealLength: number;
}

export const defaults: Settings = { cycleLength: 28, periodLength: 5, lutealLength: 14 };

export interface Period {
  start: Day;
  end: Day;
}

/** Groups bleeding days into periods. One day without bleeding doesn't end a period. */
export function periods(bleeding: Day[]): Period[] {
  const out: Period[] = [];
  for (const d of [...new Set(bleeding)].sort((a, b) => a - b)) {
    const last = out.at(-1);
    if (last && d - last.end <= 2) last.end = d;
    else out.push({ start: d, end: d });
  }
  return out;
}

export interface PastCycle {
  start: Day;
  length: number;
  periodLength: number;
}

/** A basal body temperature reading, in °C. */
export interface Temp {
  day: Day;
  celsius: number;
}

export interface Analysis {
  periods: Period[];
  /** Finished cycles, oldest first: from one period's start to the next. */
  history: PastCycle[];
  cycleLength: number;
  periodLength: number;
  /** Days from ovulation to the next period, learned from temperatures or the setting. */
  lutealLength: number;
  /** Whether the lengths come from logged periods rather than the settings. */
  learned: boolean;
  /** Whether lutealLength comes from temperature shifts rather than the setting. */
  lutealLearned: boolean;
  /** The period going on today: its logged days and the rest of its expected length. */
  current: Period | null;
  /** When the next period should start, or null before any period is logged. */
  nextStart: Day | null;
  /** How many days either side of nextStart the period can be expected. */
  margin: number;
  /** Ovulation this cycle, when a temperature shift shows it has happened. */
  confirmedOvulation: Day | null;
  /** Days past nextStart without a period. */
  late: number;
  predicted: Period[];
  ovulations: Day[];
}

// lengths are learned from the last few cycles, the latest counting most;
// longer or shorter ones are most likely a period that wasn't logged, so
// they're left out
const learnFrom = 6;
const usableCycle = (length: number) => length >= 15 && length <= 60;
const usableLuteal = (length: number) => length >= 7 && length <= 20;
const round = (x: number) => Math.floor(x + 0.5);

/** The average of the last few values, each weighted by how recent it is. */
function weighted(xs: number[]): number {
  const recent = xs.slice(-learnFrom);
  let sum = 0;
  let weights = 0;
  recent.forEach((x, i) => {
    sum += x * (i + 1);
    weights += i + 1;
  });
  return round(sum / weights);
}

/** How many days either side of the expected start, from how much cycles vary. */
function marginOf(lengths: number[]): number {
  const recent = lengths.slice(-learnFrom);
  // cycles of most people vary by a couple of days
  if (recent.length < 2) return 2;
  const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
  const variance = recent.reduce((a, x) => a + (x - mean) ** 2, 0) / recent.length;
  return Math.min(7, Math.max(1, round(Math.sqrt(variance))));
}

/**
 * The day of ovulation from basal body temperatures, by the three over six rule:
 * three readings above the highest of the six before them, the third at least
 * 0.2 °C above it. Ovulation is the day before the first high reading.
 */
export function ovulationFromTemps(temps: Temp[]): Day | null {
  const ts = [...temps].sort((a, b) => a.day - b.day);
  for (let i = 6; i + 2 < ts.length; i++) {
    // gaps of a few days are fine, a week of readings over a month isn't
    if (ts[i].day - ts[i - 6].day > 10 || ts[i + 2].day - ts[i].day > 4) continue;
    const cover = Math.max(...ts.slice(i - 6, i).map((t) => t.celsius));
    const high = ts.slice(i, i + 3).every((t) => t.celsius > cover);
    if (high && ts[i + 2].celsius >= cover + 0.2) return ts[i].day - 1;
  }
  return null;
}

/** Works out cycle lengths and predictions from the days with bleeding and any temperatures. */
export function analyze(
  bleeding: Day[],
  settings: Settings,
  now: Day,
  temps: Temp[] = [],
  cycles = 12,
): Analysis {
  const ps = periods(bleeding);
  const history = ps.slice(0, -1).map((p, i) => ({
    start: p.start,
    length: ps[i + 1].start - p.start,
    periodLength: p.end - p.start + 1,
  }));
  const usable = history.filter((c) => usableCycle(c.length)).map((c) => c.length);
  const cycleLength = usable.length ? weighted(usable) : settings.cycleLength;
  // a period that could still get another day isn't finished
  const finished = ps
    .filter((p) => p.end + 2 < now)
    .map((p) => p.end - p.start + 1)
    .filter((l) => l <= 15);
  const periodLength = finished.length ? weighted(finished) : settings.periodLength;
  // the time from ovulation to the next period hardly changes from cycle to
  // cycle, so it's learned from the cycles where temperatures show ovulation
  const tempsIn = (from: Day, to: Day) => temps.filter((t) => from <= t.day && t.day < to);
  const luteals = history
    .map((c) => {
      const o = ovulationFromTemps(tempsIn(c.start, c.start + c.length));
      return o === null ? 0 : c.start + c.length - o;
    })
    .filter(usableLuteal);
  const lutealLength = luteals.length ? weighted(luteals) : settings.lutealLength;
  const base = {
    periods: ps,
    history,
    cycleLength,
    periodLength,
    lutealLength,
    learned: usable.length > 0,
    lutealLearned: luteals.length > 0,
  };

  const last = ps.at(-1);
  if (!last)
    return {
      ...base,
      current: null,
      nextStart: null,
      margin: 0,
      confirmedOvulation: null,
      late: 0,
      predicted: [],
      ovulations: [],
    };

  const end = Math.max(last.end, last.start + periodLength - 1);
  const current = last.start <= now && now <= end ? { start: last.start, end } : null;
  // once a temperature shift shows ovulation, the period follows a luteal phase later
  const confirmedOvulation = ovulationFromTemps(tempsIn(last.start, now + 1));
  const nextStart =
    confirmedOvulation === null ? last.start + cycleLength : confirmedOvulation + lutealLength;
  const margin = confirmedOvulation === null ? marginOf(usable) : 1;
  const late = current ? 0 : Math.max(0, now - nextStart);
  // a late period is expected any day now
  const first = Math.max(nextStart, now);
  const predicted = Array.from({ length: cycles }, (_, k) => {
    const start = first + k * cycleLength;
    return { start, end: start + periodLength - 1 };
  });
  const starts = [
    ...ps.slice(1).map((p) => p.start),
    nextStart,
    ...predicted.slice(1).map((p) => p.start),
  ];
  const ovulations = starts.map((s) => s - lutealLength);
  return { ...base, current, nextStart, margin, confirmedOvulation, late, predicted, ovulations };
}

export type Phase = 'period' | 'predicted' | 'ovulation' | 'fertile';

/** What each day is, for colouring the calendar. Days not in the map are ordinary. */
export function phases(a: Analysis): Map<Day, Phase> {
  const m = new Map<Day, Phase>();
  const fill = (from: Day, to: Day, phase: Phase) => {
    for (let d = from; d <= to; d++) m.set(d, phase);
  };
  for (const o of a.ovulations) fill(o - 5, o + 1, 'fertile');
  for (const o of a.ovulations) m.set(o, 'ovulation');
  for (const p of a.predicted) fill(p.start, p.end, 'predicted');
  if (a.current) fill(a.current.start, a.current.end, 'predicted');
  for (const p of a.periods) fill(p.start, p.end, 'period');
  return m;
}

export type Chance = 'low' | 'medium' | 'high';

/** The chance of getting pregnant from sex on a day, from the fertile window. */
export function pregnancyChance(a: Analysis, day: Day): Chance {
  if (a.periods.some((p) => p.start <= day && day <= p.end)) return 'low';
  if (a.ovulations.some((o) => o - 2 <= day && day <= o)) return 'high';
  if (a.ovulations.some((o) => o - 5 <= day && day <= o + 1)) return 'medium';
  return 'low';
}

/** Which day of the cycle a day is: 1 is the first day of the period. */
export function cycleDay(a: Analysis, day: Day): number | null {
  const before = a.periods.filter((p) => p.start <= day);
  return before.length ? day - before[before.length - 1].start + 1 : null;
}

export type CyclePhase = 'menstrual' | 'follicular' | 'fertile' | 'luteal';

/** The phase of the cycle a day falls in, or null before any period is logged. */
export function cyclePhase(a: Analysis, day: Day): CyclePhase | null {
  const inPeriod = (p: Period) => p.start <= day && day <= p.end;
  if (a.periods.some(inPeriod) || (a.current && inPeriod(a.current))) return 'menstrual';
  const before = a.periods.filter((p) => p.start <= day);
  if (!before.length) return null;
  const ovulation = a.ovulations.find((o) => o > before[before.length - 1].start);
  if (ovulation === undefined || day > ovulation + 1) return 'luteal';
  return day >= ovulation - 5 ? 'fertile' : 'follicular';
}

// how likely a day is to lead to pregnancy, relative to the day of ovulation,
// from 5 days before it to the day after; it peaks in the 3 days up to ovulation
const fertileCurve = [0.3, 0.45, 0.6, 0.8, 0.95, 1, 0.35];
const baseline = 0.04;

/** A smooth 0–1 version of pregnancyChance, for drawing the cycle chart. */
export function fertility(a: Analysis, day: Day): number {
  if (a.periods.some((p) => p.start <= day && day <= p.end)) return baseline;
  let best = baseline;
  for (const o of a.ovulations) {
    const i = day - o + 5;
    if (i >= 0 && i < fertileCurve.length) best = Math.max(best, fertileCurve[i]);
  }
  return best;
}

/** The days of the cycle going on today: from the last period's start to the day before the next. */
export function currentCycle(a: Analysis, now: Day): Period | null {
  const last = a.periods.filter((p) => p.start <= now).at(-1);
  if (!last || a.nextStart === null) return null;
  // a late period stretches the cycle up to today
  return { start: last.start, end: Math.max(last.start + a.cycleLength - 1, now) };
}

export interface Stats {
  /** How many finished cycles the numbers come from. */
  count: number;
  shortest: number;
  longest: number;
  /** Days between the shortest and the longest cycle. */
  spread: number;
  /** Up to 7 days between the shortest and longest cycle counts as regular. */
  regular: boolean;
  shortestPeriod: number;
  longestPeriod: number;
}

/** How much the last year of cycles varied, or null with fewer than two of them. */
export function stats(history: PastCycle[]): Stats | null {
  const recent = history.filter((c) => usableCycle(c.length)).slice(-13);
  if (recent.length < 2) return null;
  const lengths = recent.map((c) => c.length);
  const periods = recent.map((c) => c.periodLength);
  const shortest = Math.min(...lengths);
  const longest = Math.max(...lengths);
  return {
    count: recent.length,
    shortest,
    longest,
    spread: longest - shortest,
    regular: longest - shortest <= 7,
    shortestPeriod: Math.min(...periods),
    longestPeriod: Math.max(...periods),
  };
}

/** The phase most of these days fall in, when there are enough days and one clearly leads. */
export function mostlyIn(a: Analysis, days: Day[]): CyclePhase | null {
  const counts = new Map<CyclePhase, number>();
  for (const d of days) {
    const p = cyclePhase(a, d);
    if (p) counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  const [top] = [...counts].sort((x, y) => y[1] - x[1]);
  return top && top[1] >= 3 && top[1] / days.length >= 0.6 ? top[0] : null;
}
