import { pb } from './pb';
import { checkPin, makePin, type SavedPin } from './pin';

// The app lock: with a PIN set, Flowy asks for it when it opens, and when it
// comes back after a minute in the background. The PIN is per person and device.

const relockAfter = 60_000;
const triesBeforeWait = 5;
const wait = 30_000;

const key = (user: string) => `flowy:pin:${user}`;
const user = () => (pb.authStore.isValid ? pb.authStore.record?.id : undefined);

function read(): SavedPin | null {
  const id = user();
  try {
    return id ? JSON.parse(localStorage.getItem(key(id)) ?? 'null') : null;
  } catch {
    return null;
  }
}

class Lock {
  /** The browser can hash a PIN (only on https or localhost). */
  supported = !!globalThis.crypto?.subtle;
  saved = $state<SavedPin | null>(read());
  locked = $state(!!read());
  /** After a few wrong PINs, no more tries until then. */
  waitUntil = $state(0);

  private tries = 0;
  private hiddenAt = 0;

  constructor() {
    pb.authStore.onChange(() => {
      this.saved = read();
      // signing back in takes the password, so no PIN on top
      if (!pb.authStore.isValid) this.locked = false;
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.hiddenAt = Date.now();
      else if (this.saved && Date.now() - this.hiddenAt > relockAfter) this.locked = true;
    });
  }

  /** Whether the PIN was right; wrong ones count towards a wait. */
  async unlock(pin: string): Promise<boolean> {
    if (!this.saved || Date.now() < this.waitUntil) return false;
    if (await checkPin(pin, this.saved)) {
      this.locked = false;
      this.tries = 0;
      return true;
    }
    if (++this.tries % triesBeforeWait === 0) this.waitUntil = Date.now() + wait;
    return false;
  }

  async set(pin: string) {
    const id = user();
    if (!id) return;
    const saved = await makePin(pin);
    try {
      localStorage.setItem(key(id), JSON.stringify(saved));
    } catch {
      // private browsing: the PIN lasts until the app closes
    }
    this.saved = saved;
  }

  /** Turns the lock off, and removes the PIN when the person signs out. */
  forget() {
    const id = user();
    try {
      if (id) localStorage.removeItem(key(id));
    } catch {
      // private browsing: nothing was kept
    }
    this.saved = null;
    this.locked = false;
  }
}

export const lock = new Lock();
