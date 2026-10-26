// A PIN someone can set to keep Flowy closed on their phone until it's typed in.
// Only a salted, slow hash of it is kept. It guards the app, not the browser's
// storage: the offline copy of the logs isn't encrypted with it.

export interface SavedPin {
  salt: string;
  hash: string;
}

/** 4 to 8 digits. */
export const validPin = (pin: string) => /^\d{4,8}$/.test(pin);

const toHex = (bytes: Uint8Array) =>
  [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function hash(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 200_000 },
    key,
    256,
  );
  return toHex(new Uint8Array(bits));
}

export async function makePin(pin: string): Promise<SavedPin> {
  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  return { salt: toHex(salt), hash: await hash(pin, salt) };
}

export async function checkPin(pin: string, saved: SavedPin): Promise<boolean> {
  return (await hash(pin, fromHex(saved.salt))) === saved.hash;
}
