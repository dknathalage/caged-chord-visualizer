import { DEFAULTS } from '../../learning/defaults.js';

/**
 * Creates a hold detector for mic-based challenges.
 * Requires the player to sustain the correct note for confirmMs before confirming,
 * and sustain a wrong note for wrongMs before penalizing (with a cooldown).
 */
export function createHoldDetector(params) {
  const hd = params?.holdDetection ?? DEFAULTS.holdDetection;
  const confirmMs = hd.confirmMs;
  const wrongMs = hd.wrongMs;
  const cooldownMs = hd.cooldownMs;

  let holdStart = 0;
  let wrongHold = 0;
  let wrongCd = 0;

  function check(isCorrect, isListening, onConfirm, onWrong) {
    if (isCorrect && isListening) {
      wrongHold = 0;
      if (!holdStart) holdStart = performance.now();
      if (performance.now() - holdStart >= confirmMs) { onConfirm(); return; }
    } else {
      holdStart = 0;
      if (!isCorrect && isListening) {
        if (!wrongHold) wrongHold = performance.now();
        const now = performance.now();
        if (now - wrongHold >= wrongMs && now - wrongCd >= cooldownMs) {
          onWrong();
          wrongCd = now;
          wrongHold = 0;
        }
      } else {
        wrongHold = 0;
      }
    }
  }

  function reset() {
    holdStart = 0;
    wrongHold = 0;
  }

  function resetAfterVoice() {
    holdStart = 0;
  }

  return { check, reset, resetAfterVoice };
}
