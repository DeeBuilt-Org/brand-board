/**
 * Lightweight haptic feedback.
 *
 * Reality of haptics on the web:
 *   • Android Chrome supports navigator.vibrate() — a real short buzz.
 *   • iOS Safari does NOT support navigator.vibrate at all. There is no
 *     reliable web API for the iPhone Haptic Engine, so on iOS this simply
 *     no-ops. That's expected, not a bug.
 *
 * So treat haptics as a progressive enhancement: a nice extra where it works,
 * silently absent where it doesn't. The visible press-state styling (see
 * tokens.css) is what carries the "tap registered" feeling everywhere.
 *
 * Portable: copy this file into any tool's src/lib and import haptic().
 */

type HapticPattern = 'tap' | 'success' | 'warning';

const PATTERNS: Record<HapticPattern, number | number[]> = {
  tap: 10,            // a single light buzz — for adds, toggles, selections
  success: [12, 40, 18], // double-pulse — for a completed/confirmed action
  warning: [25, 30, 25], // sharper pattern — for validation / blocked actions
};

const canVibrate =
  typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

/**
 * Fire a haptic pulse. No-ops on devices without the Vibration API (e.g. iOS).
 * @param pattern semantic intensity; defaults to a light 'tap'.
 */
export function haptic(pattern: HapticPattern = 'tap'): void {
  if (!canVibrate) return;
  try {
    navigator.vibrate(PATTERNS[pattern]);
  } catch {
    /* some browsers throw if called outside a user gesture — ignore */
  }
}
