/**
 * Haptic feedback wrapper around Web Vibration API.
 * Works on Chrome Android and most desktop browsers (no-op).
 * iOS Safari ignores `navigator.vibrate` — there's no Web API for Taptic Engine.
 */

const supports =
  typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

const STORAGE_KEY = 'budg.haptics.enabled';

function loadEnabled(): boolean {
  if (typeof localStorage === 'undefined') return true;
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === null ? true : raw === '1';
}

let enabled = loadEnabled();

export function setHapticsEnabled(value: boolean) {
  enabled = value;
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch {
    /* noop */
  }
}

export function isHapticsSupported() {
  return supports;
}

export function isHapticsEnabled() {
  return enabled && supports;
}

export function getHapticsPreference() {
  return enabled;
}

function buzz(pattern: number | number[]) {
  if (!enabled || !supports) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* noop */
  }
}

export const haptics = {
  /** Tiny tap — buttons, taps, toggles. */
  light: () => buzz(8),
  /** Slightly more pronounced — confirms an action. */
  medium: () => buzz(15),
  /** Heavy — destructive/important. */
  heavy: () => buzz(25),
  success: () => buzz([10, 40, 10]),
  warning: () => buzz([20, 40, 20]),
  error: () => buzz([30, 50, 30, 50, 30]),
};

/**
 * Install a global delegated listener that fires `light()` on every button-like
 * element click. Idempotent.
 */
let installed = false;
export function installGlobalButtonHaptics() {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  const handler = (e: Event) => {
    const target = e.target as Element | null;
    if (!target) return;
    const el = target.closest(
      'button, [role="button"], a[href], input[type="checkbox"], input[type="radio"], summary, [data-haptic]',
    ) as HTMLElement | null;
    if (!el) return;
    if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return;
    const kind = el.getAttribute('data-haptic') || 'light';
    switch (kind) {
      case 'medium':
        haptics.medium();
        break;
      case 'heavy':
        haptics.heavy();
        break;
      case 'success':
        haptics.success();
        break;
      case 'warning':
        haptics.warning();
        break;
      case 'error':
        haptics.error();
        break;
      default:
        haptics.light();
    }
  };

  // pointerdown → feels instant; click would lag noticeably.
  document.addEventListener('pointerdown', handler, { passive: true });
}
