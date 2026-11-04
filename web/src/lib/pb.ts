import PocketBase, { type RecordModel } from 'pocketbase';

// The web app is served by the backend, so the API is on the same origin.
export const pb = new PocketBase('/');
// a repeated request (say, a sync while the calendar loads) shouldn't cancel the first
pb.autoCancellation(false);

export interface User extends RecordModel {
  email: string;
  name: string;
  role: 'owner' | 'member' | '';
  cycle_length: number;
  period_length: number;
  luteal_length: number;
  remind_period: boolean;
  remind_fertile: boolean;
  remind_pill: boolean;
  discreet_reminders: boolean;
}

/** Turns an API error into a sentence to show the user. */
export function errorMessage(
  err: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  const e = err as { status?: number; response?: { message?: string } };
  if (e?.status === 0) return "Can't reach the server. Check your connection.";
  return e?.response?.message || fallback;
}
