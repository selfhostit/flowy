import { describe, expect, it } from 'vitest';
import { merge, parseImport } from './import';
import { exportCsv, type DayLog } from './log';
import { fieldsOf } from './offline';

describe('parseImport', () => {
  it("reads Flowy's own export back", () => {
    const logs = [
      fieldsOf({
        date: '2026-02-01',
        flow: 'heavy',
        symptoms: ['cramps', 'tender_breasts'],
        custom_symptoms: [
          { label: 'Hot flush', icon: '✨' },
          { label: 'Dizzy', icon: '✨' },
        ],
        moods: ['calm'],
        sex: 'protected',
        pill: true,
        temperature: 36.6,
        weight: 61.5,
        notes: 'tired, "very"\nand more',
      }),
      fieldsOf({ date: '2026-02-02', flow: 'spotting' }),
    ];
    expect(parseImport(exportCsv(logs as DayLog[])).days).toEqual(logs);
  });

  it('finds columns by name, with other separators, date orders and labels', () => {
    const csv = [
      'Day;Menstruation;Symptom;Mood;BBT;Note',
      '03/14/2025;Light;Headache, Tender breasts, Dizzy;Happy, Bored;97.7;',
      '03/15/2025;3;;;;ok',
      '03/16/2025;;;;;',
      'not a date;heavy;;;;',
    ].join('\r\n');
    const { days, skipped } = parseImport(csv);
    expect(skipped).toBe(1);
    expect(days).toEqual([
      fieldsOf({
        date: '2025-03-14',
        flow: 'light',
        symptoms: ['headache', 'tender_breasts'],
        custom_symptoms: [{ label: 'Dizzy', icon: '✨' }],
        moods: ['happy'],
        temperature: 36.5,
        notes: 'Mood: Bored',
      }),
      fieldsOf({ date: '2025-03-15', flow: 'heavy', notes: 'ok' }),
    ]);
  });

  it('takes the day first when the dates leave it open', () => {
    const { days } = parseImport('date,flow\n03/04/2025,medium\n');
    expect(days[0].date).toBe('2025-04-03');
  });

  it('fills in periods from start and end dates', () => {
    const { days } = parseImport('Period start,Period end\n2025-01-30,2025-02-02\n');
    expect(days.map((d) => [d.date, d.flow])).toEqual([
      ['2025-01-30', 'medium'],
      ['2025-01-31', 'medium'],
      ['2025-02-01', 'medium'],
      ['2025-02-02', 'medium'],
    ]);
  });

  it('reads a list of period start dates, using the period length', () => {
    const { days } = parseImport('date\n2025-01-01\n2025-01-29\n', 3);
    expect(days.map((d) => d.date)).toEqual([
      '2025-01-01',
      '2025-01-02',
      '2025-01-03',
      '2025-01-29',
      '2025-01-30',
      '2025-01-31',
    ]);
  });

  it('reads a list of period days as they are', () => {
    const { days } = parseImport('date\n2025-01-01\n2025-01-02\n2025-01-29\n', 3);
    expect(days.map((d) => d.date)).toEqual(['2025-01-01', '2025-01-02', '2025-01-29']);
  });

  it('reads JSON, wrapped or not', () => {
    const json = JSON.stringify({
      data: [{ date: '2025-05-01T00:00:00', flow: 'medium', symptoms: ['cramps', 'Itchy'] }],
    });
    expect(parseImport(json).days).toEqual([
      fieldsOf({
        date: '2025-05-01',
        flow: 'medium',
        symptoms: ['cramps'],
        custom_symptoms: [{ label: 'Itchy', icon: '✨' }],
      }),
    ]);
  });

  it('reads a diary export, one dated entry a line', () => {
    const diary = [
      'Mar 30, 2025\tPeriod Starts',
      'Mar 30, 2025\tSymptoms:+++Abdominal cramps;++Flow,Hiccups;+Fatigue;',
      'Mar 30, 2025\tMoods:Grumpy,Bored',
      'Mar 31, 2025\tSymptoms:++++Flow,Spotting;',
      'Mar 31, 2025\tMedicine:ibuprofen,',
      'Apr 1, 2025\tSymptoms:+Spotting;',
      'Apr 2, 2025\tPeriod Ends',
      'Apr 10, 2025\tSymptoms:+Spotting;',
      'Apr 12, 2025\tIntercourse(With Condom)',
      'Apr 12, 2025\tNote:a note, with a comma',
      'Apr 27, 2025\tPeriod Starts',
    ].join('\r\n');
    const { days, skipped } = parseImport(diary, 2);
    expect(skipped).toBe(0);
    expect(days).toEqual([
      fieldsOf({
        date: '2025-03-30',
        flow: 'medium',
        symptoms: ['cramps', 'fatigue'],
        custom_symptoms: [{ label: 'Hiccups', icon: '✨' }],
        moods: ['irritable'],
        notes: 'Mood: Bored',
      }),
      fieldsOf({ date: '2025-03-31', flow: 'heavy', notes: 'Medicine: ibuprofen' }),
      fieldsOf({ date: '2025-04-01', flow: 'spotting' }),
      fieldsOf({ date: '2025-04-02', flow: 'medium' }),
      fieldsOf({ date: '2025-04-10', flow: 'spotting' }),
      fieldsOf({ date: '2025-04-12', sex: 'protected', notes: 'a note, with a comma' }),
      fieldsOf({ date: '2025-04-27', flow: 'medium' }),
      fieldsOf({ date: '2025-04-28', flow: 'medium' }),
    ]);
  });

  it('says why a file cannot be read', () => {
    expect(() => parseImport('')).toThrow('no rows');
    expect(() => parseImport('name,flow\nx,heavy')).toThrow('No date column');
    expect(() => parseImport('date,flow\nsoon,heavy')).toThrow('Nothing to import');
    expect(() => parseImport('{"oops"')).toThrow('could not be read');
  });
});

describe('merge', () => {
  it("keeps what's logged and fills the gaps", () => {
    const logged = fieldsOf({
      date: '2025-01-01',
      flow: 'light',
      symptoms: ['acne'],
      notes: 'mine',
    });
    const imported = fieldsOf({
      date: '2025-01-01',
      flow: 'heavy',
      symptoms: ['acne', 'cramps'],
      weight: 60,
      notes: 'theirs',
    });
    expect(merge(logged, imported)).toEqual({
      ...logged,
      symptoms: ['acne', 'cramps'],
      weight: 60,
      notes: 'mine\ntheirs',
    });
  });
});
