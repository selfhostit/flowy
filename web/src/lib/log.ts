import type { RecordModel } from 'pocketbase';

// What someone can log for a day; the values match backend/migrations/1761400000_cycle.go.

export type Flow = '' | 'spotting' | 'light' | 'medium' | 'heavy';

/** A symptom someone added themselves, kept on each day it's logged. */
export interface CustomSymptom {
  label: string;
  icon: string;
}

/** What's logged for a day. */
export interface DayFields {
  date: string;
  flow: Flow;
  symptoms: string[];
  custom_symptoms: CustomSymptom[];
  moods: string[];
  sex: '' | 'protected' | 'unprotected';
  pill: boolean;
  temperature: number;
  weight: number;
  notes: string;
}

export interface DayLog extends RecordModel, DayFields {
  user: string;
}

export const flows: { value: Flow; label: string }[] = [
  { value: 'spotting', label: 'Spotting' },
  { value: 'light', label: 'Light' },
  { value: 'medium', label: 'Medium' },
  { value: 'heavy', label: 'Heavy' },
];

/** Spotting is logged but doesn't count as a period. */
export const isBleeding = (flow: Flow) => flow === 'light' || flow === 'medium' || flow === 'heavy';

export const symptoms: { value: string; label: string; icon: string }[] = [
  { value: 'cramps', label: 'Cramps', icon: '🌀' },
  { value: 'headache', label: 'Headache', icon: '🤕' },
  { value: 'backache', label: 'Backache', icon: '🦴' },
  { value: 'bloating', label: 'Bloating', icon: '🎈' },
  { value: 'tender_breasts', label: 'Tender breasts', icon: '💗' },
  { value: 'acne', label: 'Acne', icon: '🔴' },
  { value: 'fatigue', label: 'Fatigue', icon: '🥱' },
  { value: 'nausea', label: 'Nausea', icon: '🤢' },
  { value: 'cravings', label: 'Cravings', icon: '🍫' },
  { value: 'insomnia', label: 'Insomnia', icon: '🌙' },
  { value: 'discharge', label: 'Discharge', icon: '💧' },
];

export const moods: { value: string; label: string; icon: string }[] = [
  { value: 'happy', label: 'Happy', icon: '😊' },
  { value: 'calm', label: 'Calm', icon: '😌' },
  { value: 'energetic', label: 'Energetic', icon: '⚡' },
  { value: 'sensitive', label: 'Sensitive', icon: '🥺' },
  { value: 'sad', label: 'Sad', icon: '😢' },
  { value: 'anxious', label: 'Anxious', icon: '😰' },
  { value: 'irritable', label: 'Irritable', icon: '😠' },
  { value: 'tired', label: 'Tired', icon: '😴' },
];

/** Whether a day log has anything in it worth keeping. */
export function isEmpty(log: Partial<DayLog>): boolean {
  return (
    !log.flow &&
    !log.symptoms?.length &&
    !log.custom_symptoms?.length &&
    !log.moods?.length &&
    !log.sex &&
    !log.pill &&
    !log.temperature &&
    !log.weight &&
    !log.notes?.trim()
  );
}

/** Icons to pick from for a symptom of your own. */
export const customIcons = ['✨', '🤧', '😵‍💫', '🔥', '🥶', '💤', '🦵', '🫃', '🍔', '🧠'];

/** The longest label a symptom of your own can have; the server checks it too. */
export const customLabelMax = 30;

/** The symptoms someone added themselves, most used first, from all their logs. */
export function customSymptoms(logs: Iterable<DayLog>): (CustomSymptom & { count: number })[] {
  const byLabel = new Map<string, CustomSymptom & { count: number }>();
  for (const l of logs) {
    for (const s of l.custom_symptoms ?? []) {
      const key = s.label.toLowerCase();
      const seen = byLabel.get(key);
      if (seen) seen.count++;
      else byLabel.set(key, { ...s, count: 1 });
    }
  }
  return [...byLabel.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Day logs as CSV, oldest first, for a spreadsheet. */
export function exportCsv(logs: Iterable<DayLog>): string {
  const fields = [
    'date',
    'flow',
    'symptoms',
    'custom_symptoms',
    'moods',
    'sex',
    'pill',
    'temperature',
    'weight',
    'notes',
  ] as const;
  const cell = (v: unknown) => {
    // symptoms of your own can have spaces in them, so they're kept apart with semicolons
    const s = Array.isArray(v)
      ? v
          .map((x: string | CustomSymptom) => (typeof x === 'string' ? x : x.label))
          .join(v.some((x) => typeof x !== 'string') ? '; ' : ' ')
      : v === false || v === 0 || v == null
        ? ''
        : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [...logs]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((l) => fields.map((f) => cell(l[f])).join(','));
  return [fields.join(','), ...rows].join('\n') + '\n';
}
