/**
 * Pure-entertainment bingo light-board (genre homage).
 * Card layout, draw counts, and line multipliers are original —
 * not copied from any commercial cabinet ROM or prize schedule.
 */

export const COL_LETTERS = ["B", "I", "N", "G", "O"];

/** Column ranges for a standard-style 5×5 card (center free). */
export const COL_RANGES = [
  [1, 15],
  [16, 30],
  [31, 45],
  [46, 60],
  [61, 75],
];

export const POOL_SIZE = 75;
export const ROUND_COST = 10;
export const DRAW_COUNT = 20;
export const START_CREDITS = 100;

/**
 * Entertainment payout multipliers vs. round cost, by completed line count.
 * Full blackout is scored separately when all 25 cells are marked.
 */
export const LINE_MULT = {
  1: 2,
  2: 5,
  3: 12,
  4: 25,
  5: 40,
};

export const BLACKOUT_MULT = 80;

/**
 * @param {number} min
 * @param {number} max inclusive
 * @returns {number[]}
 */
function shuffleRange(min, max) {
  const arr = [];
  for (let n = min; n <= max; n++) arr.push(n);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Build a fresh 5×5 card. Cell value 0 = FREE center.
 * @returns {number[][]} row-major 5×5
 */
export function generateCard() {
  /** @type {number[][]} */
  const grid = Array.from({ length: 5 }, () => Array(5).fill(0));
  for (let c = 0; c < 5; c++) {
    const [lo, hi] = COL_RANGES[c];
    const picks = shuffleRange(lo, hi).slice(0, 5);
    for (let r = 0; r < 5; r++) {
      grid[r][c] = picks[r];
    }
  }
  grid[2][2] = 0; // FREE
  return grid;
}

/**
 * @param {number} n 1–75
 */
export function letterForNumber(n) {
  for (let c = 0; c < 5; c++) {
    const [lo, hi] = COL_RANGES[c];
    if (n >= lo && n <= hi) return COL_LETTERS[c];
  }
  return "?";
}

/**
 * Find completed rows, cols, both diags.
 * @param {boolean[][]} marked 5×5
 * @returns {{ kind: 'row'|'col'|'diag', index: number }[]}
 */
export function findWinLines(marked) {
  /** @type {{ kind: 'row'|'col'|'diag', index: number }[]} */
  const lines = [];
  for (let r = 0; r < 5; r++) {
    if (marked[r].every(Boolean)) lines.push({ kind: "row", index: r });
  }
  for (let c = 0; c < 5; c++) {
    if (marked.every((row) => row[c])) lines.push({ kind: "col", index: c });
  }
  if ([0, 1, 2, 3, 4].every((i) => marked[i][i])) {
    lines.push({ kind: "diag", index: 0 });
  }
  if ([0, 1, 2, 3, 4].every((i) => marked[i][4 - i])) {
    lines.push({ kind: "diag", index: 1 });
  }
  return lines;
}

/**
 * @param {boolean[][]} marked
 */
export function isBlackout(marked) {
  return marked.every((row) => row.every(Boolean));
}

/**
 * @param {number} lineCount
 * @param {boolean} blackout
 */
export function payoutFor(lineCount, blackout) {
  if (blackout) return ROUND_COST * BLACKOUT_MULT;
  if (lineCount <= 0) return 0;
  const mult = LINE_MULT[Math.min(lineCount, 5)] ?? LINE_MULT[5];
  return ROUND_COST * mult;
}

/**
 * Chase path over 0..cellCount-1 ending on target.
 * @param {number} targetIndex
 * @param {number} cellCount
 * @param {number} [laps]
 */
export function buildChasePath(targetIndex, cellCount, laps = 3) {
  const start = Math.floor(Math.random() * cellCount);
  const totalSteps =
    laps * cellCount + ((targetIndex - start + cellCount) % cellCount);
  const path = [];
  for (let i = 0; i <= totalSteps; i++) {
    path.push((start + i) % cellCount);
  }
  path[path.length - 1] = targetIndex;
  return path;
}

/**
 * @param {number} i
 * @param {number} n
 */
export function stepDelayMs(i, n) {
  const t = i / Math.max(1, n - 1);
  let factor;
  if (t < 0.55) {
    factor = Math.max(0.15, 1 - t * 1.2);
  } else {
    const u = (t - 0.55) / 0.45;
    factor = 0.15 + u * u * 2.4;
  }
  return 28 + factor * 95;
}

export class BingoGame {
  constructor() {
    this.credits = START_CREDITS;
    this.running = false;
    /** @type {number[][]} */
    this.card = generateCard();
    /** @type {boolean[][]} */
    this.marked = this.emptyMarked();
    /** @type {number[]} */
    this.drawn = [];
    /** @type {Set<number>} */
    this.pool = new Set();
    this.lastWin = 0;
    this.lastLines = 0;
    this.lastBlackout = false;
  }

  emptyMarked() {
    const m = Array.from({ length: 5 }, () => Array(5).fill(false));
    m[2][2] = true; // FREE always on
    return m;
  }

  addCredits(n) {
    if (this.running) return false;
    this.credits += n;
    return true;
  }

  canStart() {
    return !this.running && this.credits >= ROUND_COST;
  }

  /** New card between rounds; refunds nothing. */
  newCard() {
    if (this.running) return false;
    this.card = generateCard();
    this.marked = this.emptyMarked();
    this.drawn = [];
    this.pool = new Set();
    this.lastWin = 0;
    this.lastLines = 0;
    this.lastBlackout = false;
    return true;
  }

  /** Clear marks / draws but keep the same card. */
  clearRound() {
    if (this.running) return false;
    this.marked = this.emptyMarked();
    this.drawn = [];
    this.pool = new Set();
    this.lastWin = 0;
    this.lastLines = 0;
    this.lastBlackout = false;
    return true;
  }

  /**
   * Pay for a round and lock a draw sequence.
   * @returns {number[]} drawn numbers (length DRAW_COUNT)
   */
  beginRound() {
    if (this.running) throw new Error("already running");
    if (this.credits < ROUND_COST) throw new Error("insufficient credits");

    this.credits -= ROUND_COST;
    this.running = true;
    this.marked = this.emptyMarked();
    this.drawn = [];
    this.pool = new Set();
    this.lastWin = 0;
    this.lastLines = 0;
    this.lastBlackout = false;

    const all = shuffleRange(1, POOL_SIZE);
    return all.slice(0, DRAW_COUNT);
  }

  /**
   * Apply one drawn number to card marks.
   * @param {number} n
   * @returns {{ hit: boolean, row: number, col: number }}
   */
  applyDraw(n) {
    this.drawn.push(n);
    this.pool.add(n);
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (this.card[r][c] === n) {
          this.marked[r][c] = true;
          return { hit: true, row: r, col: c };
        }
      }
    }
    return { hit: false, row: -1, col: -1 };
  }

  /**
   * Score lines after all draws; credit payout.
   * @returns {{ lines: ReturnType<typeof findWinLines>, lineCount: number, blackout: boolean, payout: number }}
   */
  settle() {
    const lines = findWinLines(this.marked);
    const blackout = isBlackout(this.marked);
    const lineCount = lines.length;
    const payout = payoutFor(lineCount, blackout);
    this.credits += payout;
    this.lastWin = payout;
    this.lastLines = lineCount;
    this.lastBlackout = blackout;
    this.running = false;
    return { lines, lineCount, blackout, payout };
  }

  /** Abort mid-animation without payout (should not happen in normal UI). */
  abort() {
    this.running = false;
  }
}
