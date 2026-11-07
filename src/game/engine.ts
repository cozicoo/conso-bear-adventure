import bearUrl from "@/assets/sprites/bear.png";
import zapsUrl from "@/assets/sprites/zaps.png";
import boltUrl from "@/assets/sprites/bolt-zaps.png";
import starUrl from "@/assets/sprites/star-power.png";
import flagUrl from "@/assets/sprites/flag-w.png";
import dropUrl from "@/assets/sprites/drop-logo.png";
import bot0 from "@/assets/sprites/bot-0.png";
import bot1 from "@/assets/sprites/bot-1.png";
import bot2 from "@/assets/sprites/bot-2.png";
import bot3 from "@/assets/sprites/bot-3.png";
import bot4 from "@/assets/sprites/bot-4.png";
import bot5 from "@/assets/sprites/bot-5.png";
import bot6 from "@/assets/sprites/bot-6.png";
import bot7 from "@/assets/sprites/bot-7.png";
import bot8 from "@/assets/sprites/bot-8.png";
import bot9 from "@/assets/sprites/bot-9.png";

const BOT_URLS = [bot0, bot1, bot2, bot3, bot4, bot5, bot6, bot7, bot8, bot9];

const walkUrls = import.meta.glob("../assets/sprites/stride/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

function walkSet(prefix: string): string[] {
  return Object.entries(walkUrls)
    .filter(([path]) => path.includes(`/${prefix}-`))
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([, url]) => url);
}

const CONSO_URLS = import.meta.glob("../assets/sprites/conso7/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

function consoFile(name: string): string {
  const found = Object.entries(CONSO_URLS).find(([path]) => path.endsWith(`/${name}.png`));
  return found?.[1] ?? "";
}

const CONSO_IDLE_URL = consoFile("idle");
const CONSO_WALK_URLS = Array.from({ length: 8 }, (_, i) => consoFile(`walk-${i + 1}`)).filter(Boolean);
const CONSO_AIR_URLS = Array.from({ length: 5 }, (_, i) => consoFile(`air-${i + 1}`)).filter(Boolean);
const CONSO_LAND_URLS = Array.from({ length: 3 }, (_, i) => consoFile(`land-${i + 1}`)).filter(Boolean);

const BOT_WALK_URLS = Array.from({ length: 10 }, (_, i) => walkSet(`bot${i}`));
const BOT_COLORS = [
  "#3aa0e8",
  "#f0c430",
  "#f08ab0",
  "#b08ae0",
  "#4aa8e8",
  "#e0a050",
  "#8a78e0",
  "#5ad07a",
  "#f0a0a8",
  "#b7d86a",
];

const T = 32;
const VIEW_W = 800;
const VIEW_H = 448;
const COLS = 130;
const ROWS = 14;
const GROUND_ROW = 12;
const GRAVITY = 0.42;
const FALL_G = 0.78;
const MAX_FALL = 12;
const FLAG_COL = 118;
const POLE_X = FLAG_COL * T + 13;
const BEST_KEY = "conso-bots-adventure-best";
const STAR_KEYS = ["22,4", "80,4"];

const EMPTY = 0;
const GROUND = 1;
const BRICK = 2;
const QUESTION = 3;
const USED = 4;
const PIPE = 5;
const STAIR = 6;

export type Mode = "title" | "play" | "dead" | "over" | "win";
export type Action = "left" | "right" | "jump" | "run" | "start";

export type GameApi = {
  setHeld: (action: Action, down: boolean) => void;
  start: () => void;
  destroy: () => void;
};

type Body = {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  onGround: boolean;
};

type Player = Body & {
  facing: number;
  coyote: number;
  buffer: number;
  prevJump: boolean;
  big: boolean;
  inv: number;
};

type Enemy = Body & {
  dead: number;
  flipped: boolean;
  remove: boolean;
  kind: number;
  perch: boolean;
};
type Star = Body & { remove: boolean };
type Coin = { x: number; y: number; got: boolean };
type Popup = { kind: "coin" | "text"; x: number; y: number; vy: number; life: number; text: string };
type Bump = { c: number; r: number; t: number };
type Bit = { x: number; y: number; vx: number; vy: number; life: number; color: string };

declare global {
  interface Window {
    __controlsTest?: {
      setKeys: (codes: string[]) => void;
      getX: () => number;
      getVx: () => number;
      getFacing: () => number;
    };
  }
}

const GAPS: Array<[number, number]> = [
  [38, 40],
  [70, 73],
  [96, 98],
];
const ENEMY_COLS = [18, 34, 44, 62, 76, 94, 100];
const PERCH_SPOTS: Array<[number, number]> = [
  [22, 8],
  [52, 8],
  [80, 8],
  [91, 8],
];

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(src));
    img.src = src;
  });
}

export function mountGame(
  canvas: HTMLCanvasElement,
  hooks: { onMode: (mode: Mode, best: number) => void },
): GameApi {
  const raw = canvas.getContext("2d");
  if (!raw) throw new Error("canvas");
  const ctx: CanvasRenderingContext2D = raw;

  const qa = new URLSearchParams(window.location.search).has("qa");
  const keys: Record<Action, boolean> = {
    left: false,
    right: false,
    jump: false,
    run: false,
    start: false,
  };
  let probe: Set<string> | null = null;

  const keyMap: Record<string, Action> = {
    KeyW: "jump",
    KeyA: "left",
    KeyD: "right",
    Space: "jump",
    Enter: "start",
  };
  let jumpArm = 0;

  let audio: AudioContext | null = null;
  let musicGain: GainNode | null = null;
  let tune: "play" | "dead" | "win" | "none" = "none";
  let loopEnd = 0;
  let grid: number[][] = [];
  let coinsList: Coin[] = [];
  let enemies: Enemy[] = [];
  let stars: Star[] = [];
  let starCells = new Set<string>();
  let popups: Popup[] = [];
  let bumps: Bump[] = [];
  let bits: Bit[] = [];
  let player: Player = makePlayer(false);
  let cam = 0;
  let frame = 0;
  let flagY = 3 * T + 6;
  let winPhase = 0;
  let shake = 0;
  let bear: HTMLImageElement | null = null;
  let zaps: HTMLImageElement | null = null;
  let bolt: HTMLImageElement | null = null;
  let starPic: HTMLImageElement | null = null;
  let flagImg: HTMLImageElement | null = null;
  let dropImg: HTMLImageElement | null = null;
  let bots: Array<HTMLImageElement | null> = BOT_URLS.map(() => null);
  let consoIdle: HTMLImageElement | null = null;
  let consoWalk: HTMLImageElement[] = [];
  let consoAir: HTMLImageElement[] = [];
  let consoLand: HTMLImageElement[] = [];
  let gait = 0;
  let airFrames = 0;
  let landFrames = 0;
  let botWalk: HTMLImageElement[][] = BOT_WALK_URLS.map(() => []);
  let best = 0;
  try {
    best = Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    best = 0;
  }

  const game = { state: (qa ? "play" : "title") as Mode, score: 0, coins: 0, lives: 3, timer: 0 };
  let lastMode: Mode | "" = "";

  function emit() {
    const shown: Mode = game.state === "win" && winPhase < 2 ? "play" : game.state;
    if (shown !== lastMode) {
      lastMode = shown;
      hooks.onMode(shown, best);
    }
  }

  function remember() {
    if (game.score > best) {
      best = game.score;
      try {
        localStorage.setItem(BEST_KEY, String(best));
      } catch {
        /* ignore */
      }
    }
  }

  function initAudio() {
    try {
      if (!audio) audio = new AudioContext();
      if (audio.state === "suspended") void audio.resume();
    } catch {
      audio = null;
    }
  }

  function beep(freq: number, dur: number, type: OscillatorType = "square", slideTo?: number) {
    if (!audio) return;
    const now = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), now + dur);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain).connect(audio.destination);
    osc.start(now);
    osc.stop(now + dur);
  }

  function stopMusic() {
    if (musicGain && audio) {
      const now = audio.currentTime;
      musicGain.gain.cancelScheduledValues(now);
      musicGain.gain.setValueAtTime(musicGain.gain.value, now);
      musicGain.gain.linearRampToValueAtTime(0.0001, now + 0.06);
      const old = musicGain;
      window.setTimeout(() => old.disconnect(), 90);
    }
    musicGain = null;
    tune = "none";
    loopEnd = 0;
  }

  function tone(time: number, freq: number, dur: number, type: OscillatorType, volume: number) {
    if (!audio || !musicGain || freq <= 0) return;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(gain).connect(musicGain);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  function scheduleLine(notes: number[], step: number, type: OscillatorType, volume: number, start: number) {
    notes.forEach((freq, i) => tone(start + i * step, freq, step * 0.92, type, volume));
    return start + notes.length * step;
  }

  function pumpPlayLoop() {
    if (!audio || tune !== "play" || !musicGain) return;
    const now = audio.currentTime;
    if (loopEnd > now + 0.35) return;
    const start = Math.max(now + 0.04, loopEnd);
    const step = 0.17;
    const lead = [523, 659, 784, 659, 880, 784, 659, 523, 587, 698, 880, 698, 784, 659, 587, 494];
    const bass = [131, 0, 165, 0, 175, 0, 196, 0, 131, 0, 147, 0, 165, 0, 196, 0];
    scheduleLine(lead, step, "square", 0.045, start);
    loopEnd = scheduleLine(bass, step, "triangle", 0.05, start);
  }

  function syncMusic() {
    if (!audio) return;
    const want = game.state === "play" ? "play" : game.state === "dead" ? "dead" : game.state === "win" ? "win" : "none";
    if (want === tune) {
      if (want === "play") pumpPlayLoop();
      return;
    }
    stopMusic();
    tune = want;
    if (want === "none") return;
    musicGain = audio.createGain();
    musicGain.gain.value = 0.9;
    musicGain.connect(audio.destination);
    const now = audio.currentTime + 0.02;
    if (want === "play") {
      loopEnd = now;
      pumpPlayLoop();
    } else if (want === "dead") {
      scheduleLine([494, 392, 330, 262, 196], 0.24, "triangle", 0.07, now);
    } else {
      scheduleLine([523, 659, 784, 1047, 784, 1047, 1319], 0.16, "square", 0.05, now);
      scheduleLine([262, 330, 392, 523, 392, 523, 659], 0.16, "triangle", 0.04, now);
    }
  }

  function makePlayer(big: boolean): Player {
    const h = big ? 48 : 30;
    const w = big ? 26 : 20;
    return {
      x: 2 * T,
      y: GROUND_ROW * T - h,
      w,
      h,
      vx: 0,
      vy: 0,
      onGround: true,
      facing: 1,
      coyote: 0,
      buffer: 0,
      prevJump: false,
      big,
      inv: 0,
    };
  }

  function makeEnemy(c: number, kind: number, row = GROUND_ROW, perch = false): Enemy {
    const h = 30;
    return {
      x: c * T + 2,
      y: row * T - h,
      w: 26,
      h,
      vx: perch ? 1.15 : -1.9,
      vy: 0,
      onGround: true,
      dead: 0,
      flipped: false,
      remove: false,
      kind,
      perch,
    };
  }

  function buildLevel(next: Mode) {
    grid = Array.from({ length: ROWS }, () => Array(COLS).fill(EMPTY));
    for (let c = 0; c < COLS; c++) {
      if (GAPS.some(([a, b]) => c >= a && c <= b)) continue;
      grid[12][c] = GROUND;
      grid[13][c] = GROUND;
    }
    const put = (c: number, r: number, t: number) => {
      grid[r][c] = t;
    };
    const pipe = (c: number, h: number) => {
      for (let r = GROUND_ROW - h; r < GROUND_ROW; r++) {
        put(c, r, PIPE);
        put(c + 1, r, PIPE);
      }
    };
    put(16, 8, QUESTION);
    put(20, 8, BRICK);
    put(21, 8, QUESTION);
    put(22, 8, BRICK);
    put(23, 8, QUESTION);
    put(24, 8, BRICK);
    put(22, 4, QUESTION);
    for (let c = 50; c <= 54; c++) put(c, 8, BRICK);
    put(52, 8, QUESTION);
    put(66, 8, QUESTION);
    for (let c = 78; c <= 82; c++) put(c, 8, BRICK);
    put(80, 8, QUESTION);
    put(80, 4, QUESTION);
    for (let c = 90; c <= 93; c++) put(c, 8, BRICK);
    put(91, 8, QUESTION);
    pipe(30, 2);
    pipe(46, 3);
    pipe(58, 2);
    pipe(86, 3);
    for (let i = 0; i < 5; i++) {
      for (let h = 0; h <= i; h++) put(104 + i, GROUND_ROW - 1 - h, STAIR);
    }
    coinsList = (
      [
        [12, 10],
        [13, 10],
        [14, 10],
        [37, 9],
        [38, 8],
        [39, 8],
        [40, 8],
        [41, 9],
        [50, 7],
        [51, 7],
        [52, 6],
        [53, 7],
        [54, 7],
        [69, 9],
        [70, 8],
        [71, 8],
        [72, 8],
        [73, 8],
        [74, 9],
        [96, 9],
        [97, 8],
        [98, 9],
      ] as Array<[number, number]>
    ).map(([c, r]) => ({ x: c * T + T / 2, y: r * T + T / 2, got: false }));
    enemies = [
      ...ENEMY_COLS.map((c, i) => makeEnemy(c, i % BOT_URLS.length)),
      ...PERCH_SPOTS.map(([c, r], i) => makeEnemy(c, (i + 3) % BOT_URLS.length, r, true)),
    ];
    stars = [];
    starCells = new Set(STAR_KEYS);
    popups = [];
    bumps = [];
    bits = [];
    cam = 0;
    flagY = 3 * T + 6;
    winPhase = 0;
    shake = 0;
    player = makePlayer(false);
    game.state = next;
    game.timer = 0;
  }

  function held(action: Action): boolean {
    if (probe) {
      const codes: Record<Action, string[]> = {
        left: ["KeyA"],
        right: ["KeyD"],
        jump: ["KeyW", "Space"],
        run: [],
        start: ["Enter"],
      };
      return codes[action].some((code) => probe?.has(code));
    }
    return keys[action];
  }

  function solid(c: number, r: number) {
    if (c < 0 || c >= COLS) return true;
    if (r < 0 || r >= ROWS) return false;
    return grid[r][c] !== EMPTY;
  }

  function resolveX(e: Body) {
    if (e.vx === 0) return false;
    const r0 = Math.floor(e.y / T);
    const r1 = Math.floor((e.y + e.h - 1) / T);
    const c = e.vx > 0 ? Math.floor((e.x + e.w - 1) / T) : Math.floor(e.x / T);
    for (let r = r0; r <= r1; r++) {
      if (solid(c, r)) {
        e.x = e.vx > 0 ? c * T - e.w : (c + 1) * T;
        return true;
      }
    }
    return false;
  }

  function overlapsSolid(e: Body) {
    const c0 = Math.floor(e.x / T);
    const c1 = Math.floor((e.x + e.w - 1) / T);
    const r0 = Math.floor(e.y / T);
    const r1 = Math.floor((e.y + e.h - 1) / T);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) if (solid(c, r)) return true;
    }
    return false;
  }

  function burst(c: number, r: number) {
    for (let i = 0; i < 8; i++) {
      bits.push({
        x: c * T + 8 + (i % 4) * 4,
        y: r * T + 8,
        vx: (i - 3.5) * 1.1,
        vy: -2 - (i % 3),
        life: 22,
        color: i % 2 ? "#f0b429" : "#1aa3d4",
      });
    }
    shake = 5;
  }

  function spawnStar(c: number, r: number) {
    stars.push({
      x: c * T + 7,
      y: r * T - 22,
      w: 18,
      h: 18,
      vx: 1.55,
      vy: -7,
      onGround: false,
      remove: false,
    });
  }

  function grow() {
    game.score += 1000;
    popups.push({ kind: "text", x: player.x, y: player.y, vy: 0, life: 40, text: "+1000" });
    if (player.big) return;
    const next = makePlayer(true);
    player.w = next.w;
    player.y -= next.h - player.h;
    player.h = next.h;
    player.big = true;
    player.inv = Math.max(player.inv, 24);
    for (let i = 0; i < 10 && overlapsSolid(player); i++) player.y += 2;
    beep(523, 0.12);
    setTimeout(() => beep(784, 0.18), 90);
    shake = 4;
  }

  function shrink() {
    player.big = false;
    player.w = 20;
    player.h = 30;
    player.inv = 110;
    player.vy = -7;
    player.vx = -player.facing * 2;
    beep(300, 0.2, "square", 140);
    shake = 6;
  }

  function hitBlock(c: number, r: number) {
    const t = grid[r][c];
    const key = `${c},${r}`;
    if (t === QUESTION) {
      grid[r][c] = USED;
      bumps.push({ c, r, t: 0 });
      if (starCells.has(key)) {
        starCells.delete(key);
        spawnStar(c, r);
        beep(660, 0.1);
        setTimeout(() => beep(880, 0.16), 80);
      } else {
        game.coins++;
        game.score += 200;
        popups.push({ kind: "coin", x: c * T + T / 2, y: r * T, vy: -8, life: 36, text: "" });
        beep(988, 0.07);
        setTimeout(() => beep(1319, 0.22), 70);
      }
    } else if (t === BRICK && player.big) {
      grid[r][c] = EMPTY;
      game.score += 50;
      burst(c, r);
      beep(180, 0.08, "square");
    } else if (t === BRICK || t === USED) {
      bumps.push({ c, r, t: 0 });
      beep(120, 0.08, "triangle");
    } else {
      return;
    }
    enemies.forEach((en) => {
      if (!en.dead && en.x + en.w > c * T && en.x < (c + 1) * T && Math.abs(en.y + en.h - r * T) < 6) {
        killEnemy(en, true);
      }
    });
  }

  function resolveY(e: Body, isPlayer: boolean) {
    e.onGround = false;
    const c0 = Math.floor(e.x / T);
    const c1 = Math.floor((e.x + e.w - 1) / T);
    const r = e.vy > 0 ? Math.floor((e.y + e.h - 1) / T) : Math.floor(e.y / T);
    const hitCols: number[] = [];
    for (let c = c0; c <= c1; c++) if (solid(c, r)) hitCols.push(c);
    if (!hitCols.length) return;
    if (e.vy > 0) {
      e.y = r * T - e.h;
      e.vy = 0;
      e.onGround = true;
    } else if (e.vy < 0) {
      e.y = (r + 1) * T;
      e.vy = 0;
      if (isPlayer) {
        const cx = (e.x + e.w / 2) / T;
        const c = hitCols.reduce((a, b) => (Math.abs(b + 0.5 - cx) < Math.abs(a + 0.5 - cx) ? b : a));
        hitBlock(c, r);
      }
    }
  }

  function overlap(a: Body, b: Body) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function updatePlayer() {
    const p = player;
    if (p.inv > 0) p.inv--;
    const dir = (held("right") ? 1 : 0) - (held("left") ? 1 : 0);
    const maxSpd = 4.4;
    const acc = p.onGround ? 0.62 : 0.42;
    if (dir) {
      const boost = dir * p.vx < 0 ? 2 : 1;
      p.vx += dir * acc * boost;
      p.facing = dir;
    } else {
      p.vx *= p.onGround ? 0.8 : 0.97;
      if (Math.abs(p.vx) < 0.05) p.vx = 0;
    }
    p.vx = Math.max(-maxSpd, Math.min(maxSpd, p.vx));
    if (p.onGround && Math.abs(p.vx) > 0.35 && game.state === "play") {
      gait += 0.12 + Math.abs(p.vx) * 0.018;
      gait %= Math.max(1, CONSO_WALK_URLS.length);
    }

    if (p.onGround) p.coyote = 7;
    else if (p.coyote > 0) p.coyote--;
    if (jumpArm > 0) {
      jumpArm--;
      if (p.coyote > 0) {
        p.vy = p.big ? -13.2 : -11.2;
        p.coyote = 0;
        p.onGround = false;
        jumpArm = 0;
        beep(350, 0.14, "square", 700);
      }
    }
    p.vy = Math.min(p.vy + (p.vy > 0.4 ? FALL_G : GRAVITY), MAX_FALL);

    p.x += p.vx;
    if (resolveX(p)) p.vx = 0;
    if (p.x < cam) {
      p.x = cam;
      if (p.vx < 0) p.vx = 0;
    }
    p.y += p.vy;
    resolveY(p, true);
    if (!p.onGround) {
      airFrames++;
    } else {
      if (airFrames > 6) landFrames = 12;
      airFrames = 0;
      if (landFrames > 0) landFrames--;
    }
    if (p.y > VIEW_H + 40) {
      die();
      return;
    }

    coinsList.forEach((coin) => {
      if (coin.got) return;
      const reachX = (p.big ? 28 : 22) + 12;
      const top = p.y + p.h - (p.big ? 72 : 58);
      const bot = p.y + p.h + 4;
      const mid = p.x + p.w / 2;
      if (Math.abs(coin.x - mid) < reachX && coin.y > top && coin.y < bot) {
        coin.got = true;
        game.coins++;
        game.score += 100;
        beep(1175, 0.08);
      }
    });

    if (p.x + p.w > POLE_X && p.x < POLE_X + 6 && p.y + p.h > 3 * T) {
      const frac = Math.max(0, Math.min(1, (GROUND_ROW * T - (p.y + p.h)) / ((GROUND_ROW - 3) * T)));
      const bonus = Math.round(frac * 50) * 100;
      game.score += bonus;
      popups.push({ kind: "text", x: POLE_X, y: p.y, vy: 0, life: 40, text: `+${bonus}` });
      game.state = "win";
      winPhase = 0;
      p.x = POLE_X - p.w + 2;
      p.vx = 0;
      p.vy = 0;
    }
  }

  function killEnemy(e: Enemy, flipped: boolean) {
    if (e.dead) return;
    e.dead = 1;
    e.flipped = flipped;
    if (flipped) {
      e.vy = -6;
      e.vx = 0;
    }
    game.score += 100;
    popups.push({ kind: "text", x: e.x, y: e.y, vy: 0, life: 40, text: "100" });
    shake = Math.max(shake, 3);
  }

  function die() {
    if (game.state !== "play") return;
    game.state = "dead";
    game.lives--;
    game.timer = 110;
    player.vy = -10;
    player.vx = 0;
    shake = 8;
  }

  function hurt() {
    if (player.inv > 0 || game.state !== "play") return;
    if (player.big) shrink();
    else die();
  }

  function tileUnder(e: Enemy, dir: number) {
    const footX = dir > 0 ? e.x + e.w + 1 : e.x - 1;
    const c = Math.floor(footX / T);
    const r = Math.floor((e.y + e.h + 2) / T);
    return solid(c, r);
  }

  function updateEnemies() {
    const p = player;
    enemies.forEach((e) => {
      if (e.dead) {
        e.dead++;
        if (e.flipped) {
          e.vy += 0.5;
          e.y += e.vy;
        }
        if (e.dead > 40) e.remove = true;
        return;
      }
      if (e.x > cam + VIEW_W + 48) return;
      if (e.x + e.w < cam - 420) {
        e.remove = true;
        return;
      }
      const grounded = e.onGround;
      if (grounded) {
        const speed = e.perch ? 1.15 : 1.9;
        const dir = e.vx < 0 ? -1 : 1;
        e.vx = (tileUnder(e, dir) ? dir : -dir) * speed;
      }
      e.vy = Math.min(e.vy + GRAVITY, MAX_FALL);
      e.x += e.vx;
      if (resolveX(e)) e.vx *= -1;
      if (grounded && e.vx !== 0 && !tileUnder(e, e.vx > 0 ? 1 : -1)) {
        e.x -= e.vx;
        e.vx *= -1;
      }
      e.y += e.vy;
      resolveY(e, false);
      if (e.y > VIEW_H + 120) {
        e.remove = true;
        return;
      }
      if (game.state === "play" && overlap(p, e)) {
        const stomp = p.vy > 0 && p.y + p.h - e.y < 18;
        if (stomp) {
          killEnemy(e, false);
          p.vy = -7;
          p.onGround = false;
          beep(220, 0.12, "square", 80);
        } else {
          hurt();
        }
      }
    });
    enemies = enemies.filter((e) => !e.remove);
  }

  function updateStars() {
    stars.forEach((s) => {
      s.vy = Math.min(s.vy + GRAVITY, MAX_FALL);
      s.x += s.vx;
      if (resolveX(s)) s.vx *= -1;
      s.y += s.vy;
      resolveY(s, false);
      if (s.y > VIEW_H + 40) s.remove = true;
      if (game.state === "play" && overlap(player, s)) {
        s.remove = true;
        grow();
      }
    });
    stars = stars.filter((s) => !s.remove);
  }

  function updateCamera() {
    const target = Math.max(0, Math.min(COLS * T - VIEW_W, player.x - VIEW_W * 0.38));
    cam = Math.max(cam, target);
  }

  function updateWin() {
    const p = player;
    if (winPhase === 0) {
      p.y += 3;
      flagY = Math.min(flagY + 3, GROUND_ROW * T - 30);
      if (p.y >= GROUND_ROW * T - p.h) {
        p.y = GROUND_ROW * T - p.h;
        p.x = POLE_X + 12;
        p.facing = 1;
        winPhase = 1;
      }
    } else if (winPhase === 1) {
      p.x += 2;
      if (p.x > 122 * T) {
        winPhase = 2;
        remember();
        emit();
      }
    }
  }

  function update() {
    frame++;
    if (shake > 0) shake--;
    bumps.forEach((b) => b.t++);
    bumps = bumps.filter((b) => b.t < 10);
    bits.forEach((b) => {
      b.life--;
      b.vy += 0.35;
      b.x += b.vx;
      b.y += b.vy;
    });
    bits = bits.filter((b) => b.life > 0);
    popups.forEach((o) => {
      o.life--;
      if (o.kind === "coin") {
        o.y += o.vy;
        o.vy += 0.6;
      } else o.y -= 1;
    });
    popups = popups.filter((o) => o.life > 0);

    if (game.state === "play") {
      updatePlayer();
      if (game.state === "play") {
        updateEnemies();
        updateStars();
      }
      updateCamera();
    } else if (game.state === "dead") {
      player.vy += GRAVITY * 0.8;
      player.y += player.vy;
      if (--game.timer <= 0) {
        if (game.lives > 0) buildLevel("play");
        else {
          game.state = "over";
          remember();
        }
        emit();
      }
    } else if (game.state === "win") {
      updateWin();
      updateCamera();
    }
    syncMusic();
  }

  function px(n: number) {
    return Math.round(n);
  }

  function drawCloud(x: number, y: number) {
    ctx.fillStyle = "#1a4c86";
    ctx.fillRect(x, y, 40, 10);
    ctx.fillRect(x + 8, y - 8, 26, 10);
    ctx.fillRect(x + 24, y - 4, 22, 8);
  }

  function drawBackground() {
    const bands = ["#071018", "#0a1c38", "#10284f", "#163666"];
    const slice = VIEW_H / bands.length;
    bands.forEach((color, i) => {
      ctx.fillStyle = color;
      ctx.fillRect(0, i * slice, VIEW_W, slice + 1);
    });
    ctx.fillStyle = "#8fd0ea";
    for (let i = 0; i < 28; i++) {
      const x = ((i * 137) % (COLS * T)) - cam * 0.15;
      if (x < -4 || x > VIEW_W) continue;
      ctx.fillRect(px(x), 18 + ((i * 47) % 90), i % 4 === 0 ? 3 : 2, 2);
    }
    for (let i = 0; i < 18; i++) {
      const x = i * 220 + ((i * 40) % 50) - cam * 0.35;
      if (x < -80 || x > VIEW_W + 20) continue;
      drawCloud(px(x), 46 + ((i * 29) % 54));
    }
    ctx.fillStyle = "#0c2f5e";
    for (let i = 0; i < 10; i++) {
      const x = i * 460 + 40 - cam * 0.55;
      if (x < -180 || x > VIEW_W + 40) continue;
      ctx.fillRect(px(x), GROUND_ROW * T - 46, 150, 46);
      ctx.fillRect(px(x) + 24, GROUND_ROW * T - 70, 90, 28);
      ctx.fillRect(px(x) + 48, GROUND_ROW * T - 86, 46, 18);
    }
  }

  function drawBolt(x: number, y: number) {
    ctx.fillStyle = "#fff4c2";
    ctx.fillRect(x + 16, y + 6, 4, 6);
    ctx.fillRect(x + 10, y + 12, 10, 4);
    ctx.fillRect(x + 12, y + 16, 4, 8);
  }

  function drawMark(x: number, y: number, star: boolean) {
    const img = star ? starPic : bolt;
    const pad = 4;
    const size = T - pad * 2;
    if (img) {
      ctx.drawImage(img, x + pad, y + pad, size, size);
      return;
    }
    if (!star) {
      drawBolt(x, y);
      return;
    }
    ctx.fillStyle = "#fff4c2";
    ctx.fillRect(x + 14, y + 6, 4, 18);
    ctx.fillRect(x + 8, y + 12, 16, 4);
  }

  function drawTile(t: number, x: number, y: number, c: number, r: number) {
    if (t === GROUND) {
      ctx.fillStyle = "#0e3f86";
      ctx.fillRect(x, y, T, T);
      ctx.fillStyle = "#082a5c";
      ctx.fillRect(x, y + T - 3, T, 3);
      ctx.fillRect(x + T - 3, y, 3, T);
      if (r === GROUND_ROW) {
        ctx.fillStyle = "#1aa3d4";
        ctx.fillRect(x, y, T, 6);
        ctx.fillStyle = "#f0b429";
        ctx.fillRect(x, y + 6, T, 2);
      }
    } else if (t === BRICK) {
      ctx.fillStyle = "#1b4f9e";
      ctx.fillRect(x, y, T, T);
      ctx.fillStyle = "#0b316c";
      ctx.fillRect(x, y + 15, T, 2);
      ctx.fillRect(x, y + T - 2, T, 2);
      ctx.fillRect(x + 15, y, 2, 16);
      ctx.fillRect(x + 7, y + 17, 2, 13);
      ctx.fillRect(x + 23, y + 17, 2, 13);
      ctx.fillStyle = "#f0b429";
      ctx.fillRect(x + 4, y + 4, 3, 3);
      ctx.fillRect(x + 20, y + 20, 3, 3);
    } else if (t === QUESTION) {
      const glow = 0.85 + 0.15 * Math.sin(frame / 10);
      ctx.fillStyle = `rgb(${Math.round(240 * glow)},${Math.round(168 * glow)},40)`;
      ctx.fillRect(x, y, T, T);
      ctx.fillStyle = "#12366a";
      ctx.fillRect(x, y, T, 3);
      ctx.fillRect(x, y + T - 3, T, 3);
      ctx.fillRect(x, y, 3, T);
      ctx.fillRect(x + T - 3, y, 3, T);
      drawMark(x, y, starCells.has(`${c},${r}`));
    } else if (t === USED) {
      ctx.fillStyle = "#3d4e68";
      ctx.fillRect(x, y, T, T);
      ctx.fillStyle = "#243044";
      ctx.fillRect(x + 3, y + 3, T - 6, T - 6);
    } else if (t === PIPE) {
      const isRight = c > 0 && grid[r][c - 1] === PIPE;
      const isTop = r === 0 || grid[r - 1][c] !== PIPE;
      ctx.fillStyle = isRight ? "#0f4ea8" : "#1a6ad4";
      ctx.fillRect(x, y, T, T);
      ctx.fillStyle = "#08367a";
      ctx.fillRect(isRight ? x + T - 4 : x, y, 4, T);
      if (isTop) {
        ctx.fillStyle = "#3ec0ea";
        ctx.fillRect(x, y, T, 6);
        ctx.fillStyle = "#f0b429";
        ctx.fillRect(x + 6, y + 2, 4, 2);
      }
    } else if (t === STAIR) {
      ctx.fillStyle = "#2458b8";
      ctx.fillRect(x, y, T, T);
      ctx.fillStyle = "#7ec8e3";
      ctx.fillRect(x, y, T, 3);
      ctx.fillRect(x, y, 3, T);
      ctx.fillStyle = "#0c326e";
      ctx.fillRect(x, y + T - 3, T, 3);
      ctx.fillRect(x + T - 3, y, 3, T);
    }
  }

  function bumpOffset(c: number, r: number) {
    const b = bumps.find((o) => o.c === c && o.r === r);
    return b ? Math.sin((b.t / 10) * Math.PI) * 8 : 0;
  }

  function drawTiles() {
    const c0 = Math.floor(cam / T);
    const c1 = Math.min(COLS - 1, c0 + Math.ceil(VIEW_W / T) + 1);
    for (let r = 0; r < ROWS; r++) {
      for (let c = c0; c <= c1; c++) {
        const t = grid[r][c];
        if (t) drawTile(t, px(c * T - cam), px(r * T - bumpOffset(c, r)), c, r);
      }
    }
  }

  function drawFort() {
    const cx = px(121 * T - cam);
    ctx.fillStyle = "#163e86";
    ctx.fillRect(cx, 8 * T, 6 * T, 4 * T);
    ctx.fillStyle = "#0d2f66";
    for (let i = 0; i < 6; i++) ctx.fillRect(cx + i * T + 6, 8 * T - 14, 20, 14);
    const mid = cx + 3 * T;
    const doorW = 36;
    const doorH = 2 * T - 8;
    const doorX = mid - doorW / 2;
    const doorY = GROUND_ROW * T - doorH;
    const mark = 36;
    const markX = mid - mark / 2;
    const markY = 8 * T + (doorY - 8 * T - mark) / 2;
    if (dropImg) ctx.drawImage(dropImg, markX, markY, mark, mark);
    ctx.fillStyle = "#071018";
    ctx.fillRect(doorX, doorY, doorW, doorH);
    const px0 = px(POLE_X - cam);
    ctx.fillStyle = "#2458b8";
    ctx.fillRect(px0 - 8, GROUND_ROW * T - 10, 22, 10);
    ctx.fillStyle = "#d7e7f5";
    ctx.fillRect(px0, 3 * T, 4, (GROUND_ROW - 3) * T - 10);
    ctx.fillStyle = "#f0b429";
    ctx.fillRect(px0 - 3, 3 * T - 8, 10, 10);
    const fy = px(flagY);
    const flagSize = 32;
    if (flagImg) ctx.drawImage(flagImg, px0 - flagSize, fy, flagSize, flagSize);
    else {
      ctx.fillStyle = "#f0b429";
      ctx.fillRect(px0 - flagSize, fy, flagSize, flagSize);
    }
  }

  function drawZaps(x: number, y: number, size: number, spin: number) {
    const w = Math.max(3, Math.abs(Math.cos(spin)) * size);
    if (zaps) {
      ctx.drawImage(zaps, px(x - w / 2), px(y - size / 2), w, size);
      return;
    }
    ctx.fillStyle = "#f0b429";
    ctx.fillRect(px(x - w / 2), px(y - size / 2), w, size);
  }

  function drawCoins() {
    coinsList.forEach((coin) => {
      if (coin.got) return;
      const x = coin.x - cam;
      if (x < -24 || x > VIEW_W + 24) return;
      drawZaps(x, coin.y, 20, frame / 10 + coin.x);
    });
  }

  function drawStarBody(x: number, y: number) {
    if (starPic) {
      ctx.drawImage(starPic, x - 2, y - 2, 22, 22);
      return;
    }
    ctx.fillStyle = "#f0b429";
    ctx.fillRect(x + 6, y, 6, 18);
    ctx.fillRect(x, y + 6, 18, 6);
    ctx.fillStyle = "#fff4c2";
    ctx.fillRect(x + 6, y + 6, 6, 6);
    ctx.fillStyle = "#1aa3d4";
    ctx.fillRect(x + 2, y + 8, 3, 2);
    ctx.fillRect(x + 13, y + 8, 3, 2);
  }

  function drawEnemy(e: Enemy) {
    const x = px(e.x - cam);
    const y = px(e.y);
    if (x < -48 || x > VIEW_W + 48) return;
    const frames = botWalk[e.kind]?.filter(Boolean) ?? [];
    const img = (frames.length ? frames[Math.floor(frame / 8) % frames.length] : null) || bots[e.kind];
    const face = e.vx < 0 ? -1 : 1;
    ctx.save();
    if (e.dead && !e.flipped) {
      if (img) ctx.drawImage(img, x, y + e.h - 12, e.w, 12);
      else {
        ctx.fillStyle = BOT_COLORS[e.kind];
        ctx.fillRect(x, y + e.h - 8, e.w, 8);
      }
      ctx.restore();
      return;
    }
    const dh = 56;
    const dw = img ? Math.round(dh * (img.width / img.height)) : e.w;
    ctx.translate(Math.round(x + e.w / 2), Math.round(y + e.h));
    ctx.scale(face, e.flipped ? -1 : 1);
    if (img) ctx.drawImage(img, Math.round(-dw / 2), -dh, dw, dh);
    else {
      ctx.fillStyle = BOT_COLORS[e.kind];
      ctx.fillRect(-e.w / 2, -e.h, e.w, e.h - 6);
    }
    ctx.restore();
  }

  function drawPlayer() {
    const p = player;
    if (p.inv > 0 && Math.floor(frame / 4) % 2 === 0 && game.state === "play") return;
    const x = px(p.x - cam);
    const y = px(p.y);
    const ready = consoWalk.filter(Boolean);
    const air = consoAir.filter(Boolean);
    const land = consoLand.filter(Boolean);
    const moving = p.onGround && Math.abs(p.vx) > 0.35 && game.state === "play";
    let sprite: HTMLImageElement | null = consoIdle || bear;
    if (!p.onGround && air.length) {
      const index = airFrames < 3 ? 0 : airFrames < 7 ? 1 : p.vy < -3.5 ? 2 : p.vy < 2.2 ? 3 : 4;
      sprite = air[Math.min(index, air.length - 1)];
    } else if (landFrames > 0 && land.length) {
      const index = landFrames > 8 ? 0 : landFrames > 4 ? 1 : 2;
      sprite = land[Math.min(index, land.length - 1)];
    } else if (moving && ready.length) {
      sprite = ready[Math.floor(gait) % ready.length];
    }
    const dh = p.big ? 86 : 70;
    const dw = sprite ? Math.round(dh * (sprite.width / sprite.height)) : p.w;
    const plant = Math.round((21 / 362) * dh);
    ctx.save();
    ctx.translate(Math.round(x + p.w / 2), Math.round(y + p.h));
    ctx.scale(p.facing || 1, 1);
    if (sprite) ctx.drawImage(sprite, Math.round(-dw / 2), -dh + plant, dw, dh);
    else {
      ctx.fillStyle = "#f4f7fb";
      ctx.fillRect(-p.w / 2, -p.h, p.w, p.h);
    }
    ctx.restore();
  }

  function drawBits() {
    bits.forEach((b) => {
      ctx.fillStyle = b.color;
      ctx.fillRect(px(b.x - cam), px(b.y), 4, 4);
    });
    popups.forEach((o) => {
      const x = o.x - cam;
      if (o.kind === "coin") drawZaps(x, o.y, 18, o.life / 3);
      else {
        ctx.fillStyle = "#fff4c2";
        ctx.font = "bold 14px Silkscreen, monospace";
        ctx.textAlign = "center";
        ctx.fillText(o.text, px(x), px(o.y));
      }
    });
    stars.forEach((s) => drawStarBody(px(s.x - cam), px(s.y + Math.sin(frame / 6) * 1)));
  }

  function drawHUD() {
    ctx.font = "bold 15px Silkscreen, monospace";
    ctx.textAlign = "left";
    const skor = `SCORE ${String(game.score).padStart(6, "0")}`;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillText(skor, 17, 24);
    ctx.fillStyle = "#f0b429";
    ctx.fillText(skor, 16, 23);

    const life = `x${Math.max(0, game.lives)}`;
    const lifeSprite = consoIdle || bear;
    const bearH = 22;
    const bearW = lifeSprite ? bearH * (lifeSprite.width / lifeSprite.height) : 16;
    if (lifeSprite) ctx.drawImage(lifeSprite, 16, 32, bearW, bearH);
    else {
      ctx.fillStyle = "#f4f7fb";
      ctx.fillRect(16, 34, 16, 16);
    }
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillText(life, 20 + bearW, 50);
    ctx.fillStyle = "#ff4b4b";
    ctx.fillText(life, 19 + bearW, 49);

    const count = String(game.coins).padStart(2, "0");
    ctx.font = "bold 16px Silkscreen, monospace";
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillText(count, VIEW_W - 15, 30);
    ctx.fillStyle = "#7ee7ff";
    ctx.fillText(count, VIEW_W - 16, 29);
    const icon = 28;
    const gap = 8;
    const textW = ctx.measureText(count).width;
    const ix = VIEW_W - 16 - textW - gap - icon;
    if (zaps) ctx.drawImage(zaps, ix, 8, icon, icon);
    else {
      ctx.fillStyle = "#f0b429";
      ctx.fillRect(ix, 8, icon, icon);
    }
    ctx.textAlign = "left";
  }

  function draw() {
    ctx.imageSmoothingEnabled = false;
    // Clear the previous frame before the camera shake transform so sprites never trail.
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    ctx.save();
    if (shake) ctx.translate(frame % 2 ? 2 : -2, 0);
    drawBackground();
    drawTiles();
    drawFort();
    drawCoins();
    enemies.forEach(drawEnemy);
    if (!(game.state === "win" && winPhase === 2)) drawPlayer();
    drawBits();
    ctx.restore();
    drawHUD();
  }

  function begin() {
    initAudio();
    if (game.state === "title") {
      game.state = "play";
      emit();
      return;
    }
    if (game.state === "over" || (game.state === "win" && winPhase === 2)) {
      game.score = 0;
      game.coins = 0;
      game.lives = 3;
      buildLevel("play");
      emit();
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.repeat) return;
    if (e.code === "KeyS") {
      e.preventDefault();
      return;
    }
    const k = keyMap[e.code];
    if (!k) return;
    e.preventDefault();
    if (k === "jump") {
      jumpArm = 6;
      initAudio();
      return;
    }
    keys[k] = true;
    initAudio();
    if (k === "start") begin();
  }
  function onKeyUp(e: KeyboardEvent) {
    if (e.code === "KeyS") {
      e.preventDefault();
      return;
    }
    const k = keyMap[e.code];
    if (!k || k === "jump") return;
    e.preventDefault();
    keys[k] = false;
  }
  function onBlur() {
    (Object.keys(keys) as Action[]).forEach((k) => {
      keys[k] = false;
    });
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);

  buildLevel(qa ? "play" : "title");
  emit();

  void Promise.all([
    loadImage(bearUrl).then((img) => {
      bear = img;
    }),
    loadImage(zapsUrl).then((img) => {
      zaps = img;
    }),
    loadImage(boltUrl).then((img) => {
      bolt = img;
    }),
    loadImage(starUrl).then((img) => {
      starPic = img;
    }),
    loadImage(flagUrl).then((img) => {
      flagImg = img;
    }),
    loadImage(dropUrl).then((img) => {
      dropImg = img;
    }),
    ...BOT_URLS.map((url, i) =>
      loadImage(url).then((img) => {
        bots[i] = img;
      }),
    ),
    loadImage(CONSO_IDLE_URL).then((img) => {
      consoIdle = img;
    }),
    ...CONSO_WALK_URLS.map((url, i) =>
      loadImage(url).then((img) => {
        consoWalk[i] = img;
      }),
    ),
    ...CONSO_AIR_URLS.map((url, i) =>
      loadImage(url).then((img) => {
        consoAir[i] = img;
      }),
    ),
    ...CONSO_LAND_URLS.map((url, i) =>
      loadImage(url).then((img) => {
        consoLand[i] = img;
      }),
    ),
    ...BOT_WALK_URLS.flatMap((urls, kind) =>
      urls.map((url, i) =>
        loadImage(url).then((img) => {
          botWalk[kind][i] = img;
        }),
      ),
    ),
  ]).catch(() => undefined);

  window.__controlsTest = {
    setKeys(codes: string[]) {
      probe = new Set(codes);
    },
    getX: () => player.x,
    getVx: () => player.vx,
    getFacing: () => player.facing,
  };

  const STEP = 1000 / 60;
  let last = performance.now();
  let acc = 0;
  let raf = 0;
  let alive = true;
  function loop(now: number) {
    if (!alive) return;
    acc += Math.min(now - last, 100);
    last = now;
    while (acc >= STEP) {
      update();
      acc -= STEP;
    }
    draw();
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  return {
    setHeld(action, down) {
      if (action === "jump") {
        if (down) jumpArm = 6;
        return;
      }
      if (action === "run") return;
      keys[action] = down;
      if (down) initAudio();
    },
    start: begin,
    destroy() {
      alive = false;
      stopMusic();
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      if (window.__controlsTest) delete window.__controlsTest;
    },
  };
}
