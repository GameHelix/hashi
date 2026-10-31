import { buildBoard, DC, DR, edgeBetween } from "./board";
import { LEVELS } from "./constants";
import { makeRng, randomSeed, type Rng } from "./rng";
import { countSolutions, profileBoard, type Profile } from "./solver";
import type { Difficulty, Island, Puzzle } from "./types";

/**
 * Puzzle generation:
 *   1. grow a random connected bridge network — start from one island and
 *      repeatedly send a bridge out of an existing island along a clear line,
 *      dropping a new island where it lands; bridges never cross and islands
 *      never touch;
 *   2. add a few extra bridges between islands that already see each other,
 *      which closes cycles, and make some bridges double;
 *   3. write each island's bridge total on it as its number;
 *   4. keep the board only if the solver proves the answer unique. Candidates
 *      are graded by the reasoning they need (see `profileBoard`), and each
 *      level keeps the best fit: Easy and Medium must fall to propagation
 *      alone, Hard and Expert prefer boards that lean on connectivity
 *      reasoning or a one-step lookahead.
 *
 * Every random choice comes from one seeded stream, and the attempt budget is
 * a fixed count (never a clock), so a seed always yields the same board. A
 * candidate costs well under a millisecond, so even Expert stays far below the
 * time budget.
 */

export interface GenerateOptions {
  difficulty: Difficulty;
  seed?: number | string;
}

export interface Tuning {
  /** Longest bridge, in cells from island to island. */
  maxSpan: number;
  /** Chance a bridge is double. */
  doubles: number;
  /** Chance an unused visible pair becomes an extra bridge. */
  extras: number;
  /**
   * How well a uniquely solvable board suits the level: 0 rejects it, 1 is
   * acceptable, 2 is ideal and ends the search at once.
   */
  fit: (p: Profile) => number;
}

/** Pure counting, or at most one light touch of connectivity. */
function easyFit(p: Profile): number {
  if (p.grade === "basic") return 2;
  return p.grade === "connected" && p.connectivity <= 1 ? 1 : 0;
}

/** Deducible without guessing, ideally needing the connectivity rules. */
function mediumFit(p: Profile): number {
  if (p.grade === "connected") return 2;
  return p.grade === "basic" ? 1 : 0;
}

/** Repeated connectivity reasoning, or a short lookahead. */
function hardFit(p: Profile): number {
  if (p.grade === "lookahead") return p.lookahead <= 2 ? 2 : 1;
  if (p.grade === "connected") return p.connectivity >= 2 ? 2 : 1;
  return p.grade === "basic" ? 1 : 0;
}

/** The deepest reasoning on offer: lookahead, or heavy connectivity work. */
function expertFit(p: Profile): number {
  if (p.grade === "lookahead") return 2;
  if (p.grade === "connected") return p.connectivity >= 3 ? 2 : 1;
  return p.grade === "basic" ? 1 : 0;
}

// Fewer double bridges on the bigger boards mean smaller numbers, which leave
// more room for doubt and so call for more reasoning.
const TUNING: Record<Difficulty, Tuning> = {
  easy: { maxSpan: 4, doubles: 0.4, extras: 0.3, fit: easyFit },
  medium: { maxSpan: 5, doubles: 0.35, extras: 0.3, fit: mediumFit },
  hard: { maxSpan: 6, doubles: 0.35, extras: 0.3, fit: hardFit },
  expert: { maxSpan: 6, doubles: 0.3, extras: 0.3, fit: expertFit },
};

/** Candidates examined before settling for the best acceptable one. */
const ATTEMPTS = 250;

interface Network {
  islands: Island[];
  /** Bridges as island-index pairs into `islands`, with their counts. */
  bridges: { i: number; j: number; n: number }[];
}

const WATER = 0;
const ISLAND = 1;
const SPAN = 2;

/** Grow one random network on a `size × size` grid, or null if it stalls short. */
export function growNetwork(
  size: number,
  target: number,
  tuning: Pick<Tuning, "maxSpan" | "doubles" | "extras">,
  rng: Rng
): Network | null {
  const mark = new Uint8Array(size * size);
  const pts: { r: number; c: number }[] = [];
  const bridges: Network["bridges"] = [];

  const isIsland = (r: number, c: number) =>
    r >= 0 && r < size && c >= 0 && c < size && mark[r * size + c] === ISLAND;
  // A new island needs open water and no island right beside it, so islands
  // never touch and every bridge has visible length.
  const roomFor = (r: number, c: number) =>
    mark[r * size + c] === WATER &&
    !isIsland(r - 1, c) &&
    !isIsland(r + 1, c) &&
    !isIsland(r, c - 1) &&
    !isIsland(r, c + 1);

  // How many islands sit within two cells of each cell; growth prefers quiet
  // water so islands spread over the whole grid instead of clumping.
  const crowd = new Uint8Array(size * size);
  const place = (r: number, c: number) => {
    mark[r * size + c] = ISLAND;
    pts.push({ r, c });
    for (let y = Math.max(0, r - 2); y <= Math.min(size - 1, r + 2); y++) {
      for (let x = Math.max(0, c - 2); x <= Math.min(size - 1, c + 2); x++) crowd[y * size + x]++;
    }
  };

  const lo = Math.floor(size / 4);
  const hi = size - 1 - lo;
  place(rng.int(lo, hi), rng.int(lo, hi));

  const cands: { from: number; d: number; len: number }[] = [];
  const weights: number[] = [];
  while (pts.length < target) {
    cands.length = 0;
    weights.length = 0;
    pts.forEach(({ r, c }, from) => {
      for (let d = 0; d < 4; d++) {
        for (let len = 1; len <= tuning.maxSpan; len++) {
          const rr = r + DR[d] * len;
          const cc = c + DC[d] * len;
          if (rr < 0 || rr >= size || cc < 0 || cc >= size) break;
          if (mark[rr * size + cc] !== WATER) break; // an island or a bridge is in the way
          if (len < 2 || !roomFor(rr, cc)) continue;
          const quiet = 1 / (1 + crowd[rr * size + cc]);
          cands.push({ from, d, len });
          // Quiet water first; shorter bridges keep the board compact.
          weights.push((quiet * quiet) / Math.sqrt(len));
        }
      }
    });
    if (cands.length === 0) return null;
    const { from, d, len } = cands[rng.weighted(weights)];
    const { r, c } = pts[from];
    for (let k = 1; k < len; k++) mark[(r + DR[d] * k) * size + (c + DC[d] * k)] = SPAN;
    place(r + DR[d] * len, c + DC[d] * len);
    bridges.push({ i: from, j: pts.length - 1, n: rng.next() < tuning.doubles ? 2 : 1 });
  }

  // Extra bridges between islands that already see each other close cycles,
  // so the answer is not simply the tree that was grown.
  const indexOf = new Map<number, number>();
  pts.forEach((p, k) => indexOf.set(p.r * size + p.c, k));
  const layout = buildBoard(
    size,
    size,
    pts.map((p) => ({ ...p, need: 0 }))
  );
  const used = new Set(bridges.map((b) => pairKey(b.i, b.j)));
  const order = rng.shuffle(layout.edges.map((_, e) => e));
  for (const e of order) {
    const edge = layout.edges[e];
    const a = layout.islands[edge.a];
    const b = layout.islands[edge.b];
    const i = indexOf.get(a.r * size + a.c) as number;
    const j = indexOf.get(b.r * size + b.c) as number;
    if (used.has(pairKey(i, j))) continue;
    if (edge.cells.some((cell) => mark[cell] !== WATER)) continue; // would cross
    if (rng.next() >= tuning.extras) continue;
    for (const cell of edge.cells) mark[cell] = SPAN;
    used.add(pairKey(i, j));
    bridges.push({ i, j, n: rng.next() < tuning.doubles ? 2 : 1 });
  }

  // Insist on islands along all four borders so the grid is used edge to edge.
  const rows = new Set(pts.map((p) => p.r));
  const cols = new Set(pts.map((p) => p.c));
  if (!rows.has(0) || !rows.has(size - 1) || !cols.has(0) || !cols.has(size - 1)) return null;

  const need = new Array<number>(pts.length).fill(0);
  for (const b of bridges) {
    need[b.i] += b.n;
    need[b.j] += b.n;
  }
  return { islands: pts.map((p, k) => ({ r: p.r, c: p.c, need: need[k] })), bridges };
}

function pairKey(i: number, j: number): string {
  return i < j ? `${i}:${j}` : `${j}:${i}`;
}

/** Turn a network into a puzzle, mapping its bridges onto the board's edges. */
function toPuzzle(size: number, net: Network, difficulty: Difficulty, seed: string): Puzzle {
  const board = buildBoard(size, size, net.islands);
  const solution = new Array<number>(board.edges.length).fill(0);
  for (const b of net.bridges) {
    const p = net.islands[b.i];
    const q = net.islands[b.j];
    const e = edgeBetween(board, board.islandAt[p.r * size + p.c], board.islandAt[q.r * size + q.c]);
    if (e === -1) throw new Error("generated bridge has no matching edge");
    solution[e] = b.n;
  }
  return { ...board, difficulty, seed, solution };
}

/** Generate a uniquely solvable puzzle for a difficulty, reproducibly from `seed`. */
export function generatePuzzle(options: GenerateOptions): Puzzle {
  const { difficulty } = options;
  const seed = String(options.seed ?? randomSeed());
  const level = LEVELS[difficulty];
  const tuning = TUNING[difficulty];
  const rng = makeRng(`hashi:${difficulty}:${seed}`);

  let best: Puzzle | null = null;
  let bestFit = 0;
  for (let attempt = 0; ; attempt++) {
    if (attempt >= ATTEMPTS && best) return best;
    const target = rng.int(level.islands[0], level.islands[1]);
    const net = growNetwork(level.size, target, tuning, rng);
    if (!net) continue;
    const puzzle = toPuzzle(level.size, net, difficulty, seed);
    const profile = profileBoard(puzzle);
    if (profile.grade === "search") {
      // Only reachable in the (never observed) case that no deducible board
      // turned up within the budget: settle for one proven unique by search.
      if (attempt >= ATTEMPTS && countSolutions(puzzle, 2) === 1) return puzzle;
      continue;
    }
    const fit = tuning.fit(profile);
    if (fit >= 2) return puzzle;
    if (fit > bestFit) {
      best = puzzle;
      bestFit = fit;
    }
  }
}
