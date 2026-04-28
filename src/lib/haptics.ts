/**
 * Haptic feedback for the PWA.
 *
 * Uses the Web Vibration API (`navigator.vibrate`). Supported on:
 *  - Chrome / Firefox on Android
 *  - iOS PWAs in standalone mode since iOS 17.4
 *
 * On unsupported platforms (desktop Safari, desktop Chrome) the calls are
 * no-ops. Patterns mirror Apple's UIImpactFeedback / UINotificationFeedback
 * taxonomy as closely as the binary on/off vibration motor allows.
 *
 * Per HIG: keep haptics rare and meaningful. Use only on completion of a
 * primary user action (save / delete / apply) or at a threshold crossing
 * (sheet dismiss, swipe-action commit), not on every tap.
 */

const supported = typeof navigator !== 'undefined' && 'vibrate' in navigator

function vibrate(pattern: number | number[]): void {
  if (!supported) return
  try {
    navigator.vibrate(pattern)
  } catch {
    // Some browsers throw on certain patterns; never let this break the UI.
  }
}

export const haptics = {
  /** A discrete change: theme toggle, lens switch, segment change. */
  selection: () => vibrate(8),
  /** A confirmation that something light happened: save, copy. */
  light: () => vibrate(12),
  /** A more substantive change: rebalance applied, sheet committed. */
  medium: () => vibrate(25),
  /** A heavy, attention-getting tick: destructive confirm, drag-drop commit. */
  heavy: () => vibrate(40),
  /** A success pulse — three-tap "ding-ding-ding". */
  success: () => vibrate([12, 30, 12]),
  /** A warning pulse — two-tap. */
  warning: () => vibrate([20, 60, 20]),
  /** An error pulse — three-tap, heavier. */
  error: () => vibrate([40, 30, 40]),
}
