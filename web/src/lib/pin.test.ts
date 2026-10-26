import { describe, expect, it } from 'vitest';
import { checkPin, makePin, validPin } from './pin';

describe('validPin', () => {
  it('takes 4 to 8 digits', () => {
    expect(['1234', '12345678'].map(validPin)).toEqual([true, true]);
    expect(['123', '123456789', '12a4', ''].map(validPin)).toEqual([false, false, false, false]);
  });
});

describe('PIN', () => {
  it('checks the PIN against its hash', async () => {
    const saved = await makePin('2468');
    expect(saved.hash).not.toContain('2468');
    expect(await checkPin('2468', saved)).toBe(true);
    expect(await checkPin('2469', saved)).toBe(false);
  });

  it('salts each PIN', async () => {
    const [a, b] = await Promise.all([makePin('2468'), makePin('2468')]);
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });
});
