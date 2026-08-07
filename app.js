import { BingoAudio } from "./audio.js";
import {
  BingoGame,
  COL_LETTERS,
  DRAW_COUNT,
  ROUND_COST,
  buildChasePath,
  letterForNumber,
  stepDelayMs,
} from "./game.js";

const audio = new BingoAudio();
const game = new BingoGame();

const creditsEl = document.getElementById("credits");
const lastWinEl = document.getElementById("last-win");
const statusEl = document.getElementById("status");
const boardEl = document.getElementById("board");
const drawnListEl = document.getElementById("drawn-list");
const drawnCountEl = document.getElementById("drawn-count");
const callerEl = document.getElementById("caller");
const callerLetterEl = document.getElementById("caller-letter");
const callerNumberEl = document.getElementById("caller-number");
const callerSubEl = document.getElementById("caller-sub");
const btnStart = document.getElementById("btn-start");
const btnNew = document.getElementById("btn-new");
const btnClear = document.getElementById("btn-clear");
const btnCredit = document.getElementById("btn-credit");
const btnMute = document.getElementById("btn-mute");

/** @type {HTMLElement[]} */
let cellEls = [];
/** @type {HTMLElement[]} */
let callerLedEls = [];

/** Chase ring uses 20 LED slots (index 0–19 → fake “ball” positions). */
const CHASE_SLOTS = 20;

function setStatus(msg, tone = "") {
  statusEl.textContent = msg;
  statusEl.dataset.tone = tone;
}

/**
 * @param {'idle' | 'run' | 'hit' | 'win' | 'lose'} mode
 * @param {string} [detail]
 */
function setCallerMode(mode, detail = "") {
  callerEl.dataset.mode = mode;
  if (mode === "run") callerSubEl.textContent = detail || "跑燈開號";
  else if (mode === "hit") callerSubEl.textContent = detail || "中卡！";
  else if (mode === "win") callerSubEl.textContent = detail || "連線！";
  else if (mode === "lose") callerSubEl.textContent = detail || "再來";
  else callerSubEl.textContent = detail || "純娛樂";
}

function setCallerDisplay(letter, numberText) {
  callerLetterEl.textContent = letter;
  callerNumberEl.textContent = numberText;
}

function pulseCallerLeds(stepIndex) {
  const n = callerLedEls.length;
  if (!n) return;
  const on = stepIndex % n;
  callerLedEls.forEach((el, i) => {
    el.classList.toggle("on", i === on || i === (on + 1) % n);
  });
}

function renderCredits() {
  creditsEl.textContent = String(game.credits);
  lastWinEl.textContent = String(game.lastWin);
}

function setControlsEnabled(enabled) {
  btnStart.disabled = !enabled || game.credits < ROUND_COST;
  btnNew.disabled = !enabled;
  btnClear.disabled = !enabled;
  btnCredit.disabled = !enabled;
}

function buildCallerLeds() {
  const leds = callerEl.querySelector(".caller-leds");
  leds.innerHTML = "";
  callerLedEls = [];
  const slots = [];
  for (let i = 0; i < 6; i++) slots.push({ x: i / 5, y: 0 });
  for (let i = 1; i < 4; i++) slots.push({ x: 1, y: i / 4 });
  for (let i = 5; i >= 0; i--) slots.push({ x: i / 5, y: 1 });
  for (let i = 3; i >= 1; i--) slots.push({ x: 0, y: i / 4 });
  slots.forEach((slot, i) => {
    const dot = document.createElement("span");
    dot.className = "caller-led";
    dot.style.setProperty("--i", String(i));
    dot.style.left = `calc(${slot.x * 100}% - 0.19rem)`;
    dot.style.top = `calc(${slot.y * 100}% - 0.19rem)`;
    leds.appendChild(dot);
    callerLedEls.push(dot);
  });
}

function renderBoard() {
  boardEl.innerHTML = "";
  cellEls = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const val = game.card[r][c];
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.setAttribute("role", "gridcell");
      cell.dataset.row = String(r);
      cell.dataset.col = String(c);
      if (val === 0) {
        cell.classList.add("free", "marked");
        cell.textContent = "免費";
        cell.setAttribute("aria-label", "免費格");
      } else {
        cell.textContent = String(val);
        cell.setAttribute("aria-label", `${COL_LETTERS[c]} ${val}`);
        if (game.marked[r][c]) cell.classList.add("marked");
      }
      boardEl.appendChild(cell);
      cellEls.push(cell);
    }
  }
}

function cellAt(row, col) {
  return cellEls[row * 5 + col];
}

function clearBoardEffects() {
  cellEls.forEach((el) => {
    el.classList.remove("flash", "win-line");
  });
}

function renderDrawn() {
  drawnCountEl.textContent = String(game.drawn.length);
  drawnListEl.innerHTML = "";
  for (const n of game.drawn) {
    const chip = document.createElement("span");
    chip.className = "drawn-chip";
    const onCard = game.card.some((row) => row.includes(n));
    if (onCard) chip.classList.add("hit");
    chip.innerHTML = `<span class="ltr">${letterForNumber(n)}</span>${n}`;
    drawnListEl.appendChild(chip);
  }
}

/**
 * @param {number[]} path
 * @param {(i: number, idx: number) => void} onStep
 */
function runChase(path, onStep) {
  return new Promise((resolve) => {
    let i = 0;
    const step = () => {
      const idx = path[i];
      onStep(i, idx);
      const urgency = Math.min(1, i / (path.length * 0.55));
      audio.tick(urgency);
      i += 1;
      if (i >= path.length) {
        resolve();
        return;
      }
      window.setTimeout(step, stepDelayMs(i, path.length));
    };
    step();
  });
}

/**
 * Map drawn number → chase slot for visual variety.
 * @param {number} n
 */
function chaseTargetFor(n) {
  return (n - 1) % CHASE_SLOTS;
}

/**
 * Brief flash on chase ring showing candidate numbers.
 * @param {number} slot
 */
function previewChaseNumber(slot) {
  // Show a decoy number cycling with the LED ring
  const decoy = ((slot * 7 + 3) % POOL_MOD) + 1;
  setCallerDisplay(letterForNumber(decoy), String(decoy).padStart(2, "0"));
}

const POOL_MOD = 75;

async function animateDraw(n) {
  const target = chaseTargetFor(n);
  const path = buildChasePath(target, CHASE_SLOTS, 2 + Math.floor(Math.random() * 2));
  setCallerMode("run", "跑燈中…");
  callerEl.style.setProperty("--urgency", "0");

  await runChase(path, (i, idx) => {
    pulseCallerLeds(i);
    previewChaseNumber(idx);
    const urgency = Math.min(1, i / (path.length * 0.55));
    callerEl.style.setProperty("--urgency", String(urgency));
  });

  audio.stopHit();
  setCallerDisplay(letterForNumber(n), String(n).padStart(2, "0"));

  const result = game.applyDraw(n);
  renderDrawn();

  if (result.hit) {
    audio.hit();
    setCallerMode("hit", `中卡 ${letterForNumber(n)}-${n}`);
    setStatus(`開出 ${letterForNumber(n)}-${n} — 卡上點亮！`, "hit");
    const cell = cellAt(result.row, result.col);
    cell?.classList.add("marked", "flash");
    window.setTimeout(() => cell?.classList.remove("flash"), 420);
  } else {
    audio.miss();
    setCallerMode("run", "未中卡");
    setStatus(`開出 ${letterForNumber(n)}-${n}`, "run");
  }

  // Short pause between draws so players can read
  await sleep(380);
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * @param {{ kind: string, index: number }[]} lines
 */
function highlightLines(lines) {
  clearBoardEffects();
  /** @type {Set<string>} */
  const lit = new Set();
  for (const line of lines) {
    if (line.kind === "row") {
      for (let c = 0; c < 5; c++) lit.add(`${line.index},${c}`);
    } else if (line.kind === "col") {
      for (let r = 0; r < 5; r++) lit.add(`${r},${line.index}`);
    } else if (line.kind === "diag" && line.index === 0) {
      for (let i = 0; i < 5; i++) lit.add(`${i},${i}`);
    } else if (line.kind === "diag") {
      for (let i = 0; i < 5; i++) lit.add(`${i},${4 - i}`);
    }
  }
  for (const key of lit) {
    const [r, c] = key.split(",").map(Number);
    cellAt(r, c)?.classList.add("win-line");
  }
}

async function startRound() {
  await audio.unlock();
  if (game.running) return;
  if (game.credits < ROUND_COST) {
    setStatus("娛樂幣不足，請加幣。", "warn");
    return;
  }

  let sequence;
  try {
    sequence = game.beginRound();
  } catch {
    setStatus("無法開始本局。", "warn");
    return;
  }

  audio.start();
  clearBoardEffects();
  renderBoard();
  renderDrawn();
  renderCredits();
  setControlsEnabled(false);
  setStatus(`跑燈開號中（共 ${DRAW_COUNT} 球）…`, "run");
  setCallerMode("run");

  for (let i = 0; i < sequence.length; i++) {
    await animateDraw(sequence[i]);
  }

  const settled = game.settle();
  renderCredits();
  setControlsEnabled(true);

  if (settled.payout > 0) {
    highlightLines(settled.lines);
    const mult = settled.payout / ROUND_COST;
    audio.win(mult);
    if (settled.blackout) {
      setCallerMode("win", `全盤 +${settled.payout}`);
      setStatus(`全盤點亮！娛樂獎金 +${settled.payout}`, "win");
    } else {
      setCallerMode("win", `${settled.lineCount} 線 +${settled.payout}`);
      setStatus(
        `完成 ${settled.lineCount} 條連線！娛樂獎金 +${settled.payout}`,
        "win",
      );
    }
  } else {
    audio.lose();
    setCallerMode("lose", "未連線");
    setStatus("本局未連線，再試一次。", "lose");
  }

  window.setTimeout(() => {
    if (!game.running) setCallerMode("idle");
  }, 2400);
}

btnStart.addEventListener("click", () => {
  void startRound();
});

btnNew.addEventListener("click", async () => {
  await audio.unlock();
  if (!game.newCard()) return;
  audio.clear();
  clearBoardEffects();
  renderBoard();
  renderDrawn();
  renderCredits();
  setCallerDisplay("B", "--");
  setCallerMode("idle", "新卡就緒");
  setStatus("已換新賓果卡。點「開始一局」開跑。");
  setControlsEnabled(true);
});

btnClear.addEventListener("click", async () => {
  await audio.unlock();
  if (!game.clearRound()) return;
  audio.clear();
  clearBoardEffects();
  renderBoard();
  renderDrawn();
  renderCredits();
  setCallerDisplay("B", "--");
  setCallerMode("idle");
  setStatus("已清除本局標記與開號紀錄。");
  setControlsEnabled(true);
});

btnCredit.addEventListener("click", async () => {
  await audio.unlock();
  if (game.addCredits(50)) {
    audio.coin();
    renderCredits();
    setControlsEnabled(!game.running);
    setStatus("加了 50 枚娛樂幣。");
  }
});

btnMute.addEventListener("click", async () => {
  await audio.unlock();
  audio.setEnabled(!audio.enabled);
  btnMute.textContent = audio.enabled ? "音效開" : "音效關";
  btnMute.setAttribute("aria-pressed", audio.enabled ? "true" : "false");
  if (audio.enabled) audio.idle();
});

document.body.addEventListener(
  "pointerdown",
  () => {
    void audio.unlock();
  },
  { once: true },
);

buildCallerLeds();
renderBoard();
renderDrawn();
renderCredits();
setCallerMode("idle");
setControlsEnabled(true);
setStatus(`加幣 → 開始一局（${ROUND_COST} 幣開 ${DRAW_COUNT} 號）→ 連線得分。純娛樂，無真實金錢。`);
