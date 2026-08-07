/**
 * Synthesized cabinet-style SFX via Web Audio API.
 * Original tones only — no samples from real machines or commercial games.
 */

export class BingoAudio {
  constructor() {
    /** @type {AudioContext | null} */
    this.ctx = null;
    this.enabled = true;
    this.master = 0.24;
  }

  async unlock() {
    this.ensure();
    if (this.ctx?.state === "suspended") {
      await this.ctx.resume();
    }
  }

  ensure() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
    }
  }

  setEnabled(on) {
    this.enabled = on;
  }

  /**
   * @param {number} freq
   * @param {number} durSec
   * @param {OscillatorType} [type]
   * @param {number} [gain]
   * @param {number} [when]
   */
  tone(freq, durSec, type = "square", gain = 0.12, when = 0) {
    if (!this.enabled) return;
    this.ensure();
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();

    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain * this.master, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.02, durSec));
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + durSec + 0.02);
  }

  /** Coin / credit up */
  coin() {
    this.tone(880, 0.06, "square", 0.14);
    this.tone(1320, 0.08, "square", 0.1, 0.05);
  }

  /** Round start / card clear */
  start() {
    this.tone(392, 0.07, "square", 0.1);
    this.tone(523, 0.09, "square", 0.09, 0.06);
  }

  clear() {
    this.tone(220, 0.07, "triangle", 0.08);
  }

  /**
   * Chase step tick. `urgency` 0→1 as the light speeds up.
   * @param {number} urgency
   */
  tick(urgency) {
    const u = Math.max(0, Math.min(1, urgency));
    const freq = 340 + u * 520 + Math.sin(u * 10) * 18;
    const dur = 0.035 - u * 0.018;
    this.tone(freq, dur, "square", 0.1 + u * 0.07);
  }

  /** Number lands */
  stopHit() {
    this.tone(160, 0.12, "triangle", 0.16);
    this.tone(90, 0.18, "square", 0.08, 0.02);
  }

  /** Mark on player's card */
  hit() {
    this.tone(660, 0.07, "square", 0.12);
    this.tone(990, 0.1, "triangle", 0.09, 0.05);
  }

  /** Number not on card */
  miss() {
    this.tone(240, 0.05, "triangle", 0.05);
  }

  /** Line / pattern win jingle */
  win(mult = 1) {
    const base = 440;
    const steps = mult >= 40 ? 7 : mult >= 12 ? 5 : 4;
    for (let i = 0; i < steps; i++) {
      this.tone(base * Math.pow(1.25, i), 0.11, "square", 0.11, i * 0.09);
    }
    this.tone(base * 2.5, 0.28, "triangle", 0.08, steps * 0.09);
  }

  /** No lines */
  lose() {
    this.tone(200, 0.1, "sawtooth", 0.06);
    this.tone(140, 0.16, "triangle", 0.07, 0.08);
  }

  idle() {
    this.tone(660, 0.05, "square", 0.04);
    this.tone(880, 0.05, "square", 0.03, 0.12);
  }
}
