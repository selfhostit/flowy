import { describe, expect, it } from 'vitest';
import {
  analyze,
  currentCycle,
  cycleDay,
  cyclePhase,
  defaults,
  fertility,
  mostlyIn,
  ovulationFromTemps,
  periods,
  phases,
  pregnancyChance,
  stats,
  toDay,
  toIso,
  today,
} from './cycle';

const d = toDay;
const range = (from: string, n: number) => Array.from({ length: n }, (_, i) => d(from) + i);
// low readings from a day on, then high ones (same as backend/cycle/cycle_test.go)
const temps = (from: string, low: number, high: number) =>
  range(from, low + high).map((day, i) => ({ day, celsius: i < low ? 36.4 : 36.7 }));

describe('days', () => {
  it('round-trips ISO dates', () => {
    expect(toIso(d('2026-03-29'))).toBe('2026-03-29');
    expect(d('2026-03-30') - d('2026-03-29')).toBe(1);
  });

  it('takes today from the local date', () => {
    expect(toIso(today(new Date(2026, 9, 23, 23, 59)))).toBe('2026-10-23');
  });
});

describe('periods', () => {
  it('groups bleeding days, bridging one missed day', () => {
    const days = [d('2026-01-01'), d('2026-01-02'), d('2026-01-04'), d('2026-01-29')];
    expect(periods(days)).toEqual([
      { start: d('2026-01-01'), end: d('2026-01-04') },
      { start: d('2026-01-29'), end: d('2026-01-29') },
    ]);
  });
});

describe('analyze', () => {
  it('uses the settings until there is something to learn', () => {
    const a = analyze([], defaults, d('2026-01-10'));
    expect(a).toMatchObject({ cycleLength: 28, periodLength: 5, learned: false, nextStart: null });
  });

  it('learns cycle and period lengths from logged periods', () => {
    const bleeding = [
      ...range('2026-01-01', 4),
      ...range('2026-01-31', 4), // 30 days later
      ...range('2026-03-02', 4), // 30 days later
    ];
    const a = analyze(bleeding, defaults, d('2026-03-20'));
    expect(a.history.map((c) => c.length)).toEqual([30, 30]);
    expect(a).toMatchObject({ cycleLength: 30, periodLength: 4, learned: true, late: 0 });
    expect(toIso(a.nextStart!)).toBe('2026-04-01');
    expect(toIso(a.predicted[0].start)).toBe('2026-04-01');
    expect(toIso(a.predicted[1].start)).toBe('2026-05-01');
    // ovulation 14 days before each next period
    expect(a.ovulations.map(toIso).slice(0, 3)).toEqual(['2026-01-17', '2026-02-16', '2026-03-18']);
  });

  it('weights recent cycles more and gives a window from how much they vary', () => {
    // a 26-day cycle, then a 30-day one: (26 + 2×30) / 3 rounds to 29
    const bleeding = [
      ...range('2026-01-01', 4),
      ...range('2026-01-27', 4),
      ...range('2026-02-26', 4),
    ];
    expect(analyze(bleeding, defaults, d('2026-03-10'))).toMatchObject({
      cycleLength: 29,
      margin: 2,
    });
  });

  it('learns the luteal phase from temperatures and predicts from this cycle’s ovulation', () => {
    const bleeding = [...range('2026-01-01', 4), ...range('2026-01-29', 4)];
    const ts = [...temps('2026-01-01', 13, 15), ...temps('2026-01-29', 12, 3)];
    const a = analyze(bleeding, defaults, d('2026-02-12'), ts);
    // ovulation on 13 January, 16 days before the period; this cycle on 9 February
    expect(a).toMatchObject({ lutealLength: 16, lutealLearned: true, margin: 1 });
    expect(toIso(a.confirmedOvulation!)).toBe('2026-02-09');
    expect(toIso(a.nextStart!)).toBe('2026-02-25');
    expect(a.ovulations.map(toIso).slice(0, 2)).toEqual(['2026-01-13', '2026-02-09']);
  });

  it('ignores cycles that are most likely a missed log', () => {
    const bleeding = [
      ...range('2026-01-01', 3),
      ...range('2026-01-29', 3),
      ...range('2026-04-23', 3),
    ];
    expect(analyze(bleeding, defaults, d('2026-05-01')).cycleLength).toBe(28);
  });

  it('knows a period is going on, for its expected length', () => {
    const a = analyze([d('2026-02-01')], defaults, d('2026-02-03'));
    expect(a.current).toEqual({ start: d('2026-02-01'), end: d('2026-02-05') });
    expect(cycleDay(a, d('2026-02-03'))).toBe(3);
  });

  it('counts days late and expects the period from today', () => {
    const a = analyze(range('2026-01-01', 5), defaults, d('2026-02-02'));
    expect(a.current).toBeNull();
    expect(a.late).toBe(4);
    expect(toIso(a.predicted[0].start)).toBe('2026-02-02');
  });
});

describe('ovulationFromTemps', () => {
  it('needs three high readings over six low ones', () => {
    expect(toIso(ovulationFromTemps(temps('2026-01-01', 13, 3))!)).toBe('2026-01-13');
    expect(ovulationFromTemps(temps('2026-01-01', 13, 2))).toBeNull();
    expect(ovulationFromTemps(temps('2026-01-01', 5, 5))).toBeNull();
  });
});

describe('phases and chance', () => {
  const a = analyze(range('2026-01-01', 5), defaults, d('2026-01-10'));
  const p = phases(a);

  it('colours logged, predicted and fertile days', () => {
    expect(p.get(d('2026-01-03'))).toBe('period');
    expect(p.get(d('2026-01-29'))).toBe('predicted');
    expect(p.get(d('2026-01-15'))).toBe('ovulation');
    expect(p.get(d('2026-01-10'))).toBe('fertile');
    expect(p.get(d('2026-01-08'))).toBeUndefined();
  });

  it('rates the chance of pregnancy by the fertile window', () => {
    expect(pregnancyChance(a, d('2026-01-14'))).toBe('high');
    expect(pregnancyChance(a, d('2026-01-11'))).toBe('medium');
    expect(pregnancyChance(a, d('2026-01-20'))).toBe('low');
  });
});

describe('cyclePhase', () => {
  const a = analyze(range('2026-01-01', 5), defaults, d('2026-01-10'));

  it('names the phase of each day', () => {
    expect(cyclePhase(a, d('2026-01-02'))).toBe('menstrual');
    expect(cyclePhase(a, d('2026-01-07'))).toBe('follicular');
    expect(cyclePhase(a, d('2026-01-15'))).toBe('fertile');
    expect(cyclePhase(a, d('2026-01-20'))).toBe('luteal');
    expect(cyclePhase(a, d('2025-12-20'))).toBeNull();
  });
});

describe('fertility', () => {
  const a = analyze(range('2026-01-01', 5), defaults, d('2026-01-10'));

  it('peaks around ovulation and agrees with the chance', () => {
    const peak = fertility(a, d('2026-01-15'));
    expect(peak).toBe(1);
    expect(fertility(a, d('2026-01-13'))).toBeGreaterThan(fertility(a, d('2026-01-11')));
    expect(fertility(a, d('2026-01-03'))).toBeLessThan(0.1);
    for (let day = d('2026-01-01'); day < d('2026-02-01'); day++) {
      const f = fertility(a, day);
      const want = f >= 0.8 ? 'high' : f >= 0.3 ? 'medium' : 'low';
      expect(pregnancyChance(a, day)).toBe(want);
    }
  });
});

describe('currentCycle', () => {
  it('runs from the last period to the day before the next', () => {
    const a = analyze(range('2026-01-01', 5), defaults, d('2026-01-10'));
    expect(currentCycle(a, d('2026-01-10'))).toEqual({
      start: d('2026-01-01'),
      end: d('2026-01-28'),
    });
    expect(currentCycle(analyze([], defaults, d('2026-01-10')), d('2026-01-10'))).toBeNull();
  });

  it('stretches to today when the period is late', () => {
    const a = analyze(range('2026-01-01', 5), defaults, d('2026-02-02'));
    expect(currentCycle(a, d('2026-02-02'))?.end).toBe(d('2026-02-02'));
  });
});

describe('stats', () => {
  const cycle = (length: number, periodLength = 5) => ({ start: 0, length, periodLength });

  it('needs two cycles', () => {
    expect(stats([cycle(28)])).toBeNull();
  });

  it('measures the spread and calls up to 7 days regular', () => {
    expect(stats([cycle(27, 4), cycle(31, 6), cycle(29)])).toEqual({
      count: 3,
      shortest: 27,
      longest: 31,
      spread: 4,
      regular: true,
      shortestPeriod: 4,
      longestPeriod: 6,
    });
    expect(stats([cycle(25), cycle(34)])?.regular).toBe(false);
  });

  it('leaves out cycles that are most likely a missed log', () => {
    expect(stats([cycle(28), cycle(90), cycle(30)])).toMatchObject({ count: 2, longest: 30 });
  });
});

describe('mostlyIn', () => {
  const a = analyze(range('2026-01-01', 5), defaults, d('2026-01-10'));

  it('names the phase most days fall in', () => {
    expect(mostlyIn(a, range('2026-01-01', 3))).toBe('menstrual');
    expect(mostlyIn(a, [...range('2026-01-01', 3), d('2026-01-20')])).toBe('menstrual');
  });

  it('stays quiet with too few days or no clear phase', () => {
    expect(mostlyIn(a, range('2026-01-01', 2))).toBeNull();
    expect(mostlyIn(a, [...range('2026-01-01', 3), ...range('2026-01-19', 3)])).toBeNull();
  });
});
