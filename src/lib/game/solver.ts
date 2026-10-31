import type { Board, Bridges } from "./types";

/**
 * The solver works on **domains**: for every edge, the set of bridge counts
 * still possible, stored as a 3-bit mask (bit v set ⇔ v bridges allowed). Rules
 * only ever remove values, so propagation always terminates, and because every
 * rule is sound, an edge narrowed to one value is genuinely forced.
 *
 * Rules, from simplest to strongest:
 *   - **capacity** — an island's bridges must add up to its number. Every
 *     combination of its (at most four) edges is checked, so a value survives
 *     only if some full combination supports it (generalised arc consistency).
 *   - **crossing** — once a pair must hold a bridge, every pair crossing it
 *     must hold none.
 *   - **isolation** — a set of islands whose numbers are used up by the bridges
 *     among them is cut off from the rest, so no choice may close a group
 *     smaller than the whole board (the classic "two 1s never join" rule, in
 *     general form).
 *   - **cut** — if a pair is the only remaining route between two parts of the
 *     board, it must hold a bridge.
 *   - **lookahead** — try each remaining value of a pair; if the rules above
 *     reach a contradiction, that value is impossible.
 * Backtracking on top of these counts solutions exactly, which is how the
 * generator proves a board unique.
 */

/** Bit for "v bridges allowed". */
const BIT: readonly number[] = [1, 2, 4];
/** All three counts allowed. */
export const ANY = 7;
/** Only zero bridges allowed. */
const ZERO = 1;
/** One or two bridges (at least one). */
const SOME = 6;

/** Smallest count a domain allows. */
export function low(d: number): number {
  return d & 1 ? 0 : d & 2 ? 1 : 2;
}

/** Largest count a domain allows. */
export function high(d: number): number {
  return d & 4 ? 2 : d & 2 ? 1 : 0;
}

function isSingle(d: number): boolean {
  return d === 1 || d === 2 || d === 4;
}

function popcount(d: number): number {
  return (d & 1) + ((d >> 1) & 1) + ((d >> 2) & 1);
}

export type Rule = "capacity" | "crossing" | "isolation" | "cut" | "lookahead";

/** One narrowing step, recorded when a trace is requested (hints use it). */
export interface Narrowing {
  edge: number;
  before: number;
  after: number;
  rule: Rule;
  /** The island whose constraint drove the step, or -1 for global rules. */
  island: number;
}

/** Counters for how much of each kind of reasoning a solve needed. */
export interface SolveStats {
  /** Connectivity passes that narrowed something. */
  connectivity: number;
  /** Counts removed by lookahead trials. */
  lookahead: number;
}

export interface PropagateOptions {
  /** Apply the isolation and cut rules (default true). */
  connectivity?: boolean;
  /** Collect every narrowing step, in order. */
  trace?: Narrowing[];
  /** Tally the reasoning used. */
  stats?: SolveStats;
}

/** Domains before any reasoning: 0..2 bridges, capped by both islands' numbers. */
export function initialDomains(board: Board): Uint8Array {
  const dom = new Uint8Array(board.edges.length);
  board.edges.forEach((edge, e) => {
    const cap = Math.min(2, board.islands[edge.a].need, board.islands[edge.b].need);
    dom[e] = cap >= 2 ? ANY : cap === 1 ? 3 : ZERO;
  });
  return dom;
}

/**
 * Domains for a player position: each pair keeps at least the bridges already
 * drawn. Used by the hint engine, which reasons forward from what is on screen.
 */
export function domainsFrom(board: Board, bridges: Bridges): Uint8Array {
  const dom = initialDomains(board);
  for (let e = 0; e < dom.length; e++) {
    for (let v = 0; v < bridges[e] && v < 3; v++) dom[e] &= ~BIT[v];
  }
  return dom;
}

/** True once every edge is down to a single count. */
export function isDetermined(dom: Uint8Array): boolean {
  for (let e = 0; e < dom.length; e++) if (!isSingle(dom[e])) return false;
  return true;
}

/** The single count of each edge (call only on determined domains). */
export function valuesOf(dom: Uint8Array): number[] {
  return Array.from(dom, (d) => low(d));
}

// Scratch space for the per-island combination search; islands have at most
// four edges, so these never grow.
const pick = [0, 0, 0, 0];
const support = [0, 0, 0, 0];

/**
 * Narrow `dom` in place with every rule (except lookahead) until nothing
 * changes. Returns false if the position is contradictory.
 */
export function propagate(board: Board, dom: Uint8Array, options: PropagateOptions = {}): boolean {
  const { connectivity = true, trace, stats } = options;
  const n = board.islands.length;
  // FIFO in row-major order, so the first deductions found are the ones that
  // need the least context — the hint engine relies on this ordering.
  const queue: number[] = [];
  let head = 0;
  const queued = new Uint8Array(n);
  const enqueue = (i: number) => {
    if (!queued[i]) {
      queued[i] = 1;
      queue.push(i);
    }
  };

  const narrow = (e: number, mask: number, rule: Rule, island: number): boolean => {
    const before = dom[e];
    const after = before & mask;
    if (after === before) return true;
    dom[e] = after;
    trace?.push({ edge: e, before, after, rule, island });
    if (after === 0) return false;
    enqueue(board.edges[e].a);
    enqueue(board.edges[e].b);
    if ((before & ZERO) !== 0 && (after & ZERO) === 0) {
      for (const f of board.crossings[e]) {
        if (!narrow(f, ZERO, "crossing", -1)) return false;
      }
    }
    return true;
  };

  // Pairs that already must carry a bridge block whatever crosses them.
  for (let e = 0; e < dom.length; e++) {
    if (dom[e] === 0) return false;
    if (!(dom[e] & ZERO)) {
      for (const f of board.crossings[e]) if (!narrow(f, ZERO, "crossing", -1)) return false;
    }
  }
  for (let i = 0; i < n; i++) enqueue(i);

  for (;;) {
    while (head < queue.length) {
      const i = queue[head++];
      queued[i] = 0;
      if (!reviseIsland(board, dom, i, narrow)) return false;
    }
    if (!connectivity) return true;
    const status = connectivityPass(board, dom, narrow);
    if (status < 0) return false;
    if (status === 0) return true;
    if (stats) stats.connectivity++;
  }
}

type Narrow = (e: number, mask: number, rule: Rule, island: number) => boolean;

/** Capacity rule for one island: keep only counts some full combination supports. */
function reviseIsland(board: Board, dom: Uint8Array, i: number, narrow: Narrow): boolean {
  const edges = board.incident[i];
  const k = edges.length;
  const need = board.islands[i].need;
  if (k === 0) return need === 0;

  for (let t = 0; t < k; t++) support[t] = 0;

  const visit = (t: number, sum: number) => {
    if (t === k) {
      if (sum === need) for (let s = 0; s < k; s++) support[s] |= BIT[pick[s]];
      return;
    }
    let maxRest = 0;
    let minRest = 0;
    for (let s = t + 1; s < k; s++) {
      maxRest += high(dom[edges[s]]);
      minRest += low(dom[edges[s]]);
    }
    const d = dom[edges[t]];
    for (let v = 0; v <= 2; v++) {
      if (!(d & BIT[v])) continue;
      const total = sum + v;
      if (total + minRest > need) break;
      if (total + maxRest < need) continue;
      pick[t] = v;
      visit(t + 1, total);
    }
  };
  visit(0, 0);

  // Copy out first: narrowing can recurse into other islands' state.
  const masks = support.slice(0, k);
  for (let t = 0; t < k; t++) {
    if (!narrow(edges[t], masks[t], "capacity", i)) return false;
  }
  return true;
}

/**
 * Connectivity rules. Returns -1 on contradiction, 1 if anything narrowed,
 * 0 if the domains were already stable.
 */
function connectivityPass(board: Board, dom: Uint8Array, narrow: Narrow): number {
  const n = board.islands.length;
  if (n <= 1) return 0;
  const before = dom.slice();

  // --- cut rule (and a global reachability check) on the "could still hold a
  // bridge" graph, with Tarjan's bridge-finding DFS.
  const disc = new Int32Array(n).fill(-1);
  const lowLink = new Int32Array(n);
  const cuts: number[] = [];
  let time = 0;
  const dfs = (u: number, viaEdge: number) => {
    disc[u] = lowLink[u] = time++;
    for (const e of board.incident[u]) {
      if (e === viaEdge || !(dom[e] & SOME)) continue;
      const edge = board.edges[e];
      const v = edge.a === u ? edge.b : edge.a;
      if (disc[v] === -1) {
        dfs(v, e);
        lowLink[u] = Math.min(lowLink[u], lowLink[v]);
        if (lowLink[v] > disc[u]) cuts.push(e);
      } else {
        lowLink[u] = Math.min(lowLink[u], disc[v]);
      }
    }
  };
  dfs(0, -1);
  if (time < n) return -1; // some island can no longer reach the rest
  for (const e of cuts) if (!narrow(e, SOME, "cut", -1)) return -1;

  // --- isolation rule, on groups already joined by pairs that must hold a
  // bridge. For a group G, deficit(G) = Σ numbers − 2·Σ (minimum bridges
  // inside G) is how many bridge ends G still needs from outside. A group
  // smaller than the board with deficit 0 is sealed off: a contradiction. A
  // count on some pair that would bring a group to deficit 0 is impossible.
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  board.edges.forEach((edge, e) => {
    if (!(dom[e] & ZERO)) parent[find(edge.a)] = find(edge.b);
  });
  const size = new Int32Array(n);
  const deficit = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const root = find(i);
    size[root]++;
    deficit[root] += board.islands[i].need;
  }
  board.edges.forEach((edge, e) => {
    const lo = low(dom[e]);
    if (lo > 0) deficit[find(edge.a)] -= 2 * lo;
  });
  for (let i = 0; i < n; i++) {
    if (parent[i] === i && size[i] < n && deficit[i] === 0) return -1;
  }
  for (let e = 0; e < board.edges.length; e++) {
    const d = dom[e];
    if (isSingle(d)) continue;
    const edge = board.edges[e];
    const ra = find(edge.a);
    const rb = find(edge.b);
    const lo = low(d);
    for (let v = lo + 1; v <= 2; v++) {
      if (!(d & BIT[v])) continue;
      const merged = ra === rb ? size[ra] : size[ra] + size[rb];
      const left = ra === rb ? deficit[ra] - 2 * (v - lo) : deficit[ra] + deficit[rb] - 2 * v;
      if (left === 0 && merged < n) {
        const island = board.islands[edge.a].need <= board.islands[edge.b].need ? edge.a : edge.b;
        if (!narrow(e, ~BIT[v] & ANY, "isolation", island)) return -1;
      }
    }
  }

  for (let e = 0; e < dom.length; e++) if (dom[e] !== before[e]) return 1;
  return 0;
}

/**
 * Lookahead on top of propagation: tentatively fix each open pair to each of
 * its counts; any count that propagates to a contradiction is removed. Repeats
 * until stable. Returns false if the position is contradictory.
 */
export function lookahead(board: Board, dom: Uint8Array, options: PropagateOptions = {}): boolean {
  const { trace, stats } = options;
  if (!propagate(board, dom, options)) return false;
  for (;;) {
    let progressed = false;
    for (let e = 0; e < dom.length; e++) {
      const d = dom[e];
      if (isSingle(d)) continue;
      for (let v = 0; v <= 2; v++) {
        if (!(dom[e] & BIT[v])) continue;
        const trial = dom.slice();
        trial[e] = BIT[v];
        if (propagate(board, trial)) continue;
        const before = dom[e];
        dom[e] = before & ~BIT[v];
        trace?.push({ edge: e, before, after: dom[e], rule: "lookahead", island: -1 });
        if (stats) stats.lookahead++;
        if (!propagate(board, dom, options)) return false;
        progressed = true;
      }
    }
    if (!progressed) return true;
  }
}

/** How much reasoning a board needs, from gentlest to hardest. */
export type Grade = "basic" | "connected" | "lookahead" | "search";

export interface Profile extends SolveStats {
  grade: Grade;
}

/**
 * The weakest rule set that solves the board from scratch without guessing:
 * `basic` (capacity + crossing), `connected` (+ isolation and cut), `lookahead`
 * (+ one-step trials) or `search` (needs backtracking, or has no single answer),
 * with a tally of how often the stronger rules had to step in.
 */
export function profileBoard(board: Board): Profile {
  const stats: SolveStats = { connectivity: 0, lookahead: 0 };
  const result = (grade: Grade): Profile => ({ grade, ...stats });
  const dom = initialDomains(board);
  if (!propagate(board, dom, { connectivity: false })) return result("search");
  if (isDetermined(dom)) return result("basic");
  if (!propagate(board, dom, { stats })) return result("search");
  if (isDetermined(dom)) return result("connected");
  if (!lookahead(board, dom, { stats })) return result("search");
  return result(isDetermined(dom) ? "lookahead" : "search");
}

/** Just the grade of {@link profileBoard}. */
export function gradeBoard(board: Board): Grade {
  return profileBoard(board).grade;
}

/**
 * Count solutions, stopping once `limit` are found (2 is enough to tell
 * "unique" from "ambiguous"). Branches on the open pair with the fewest
 * remaining counts; each branch fixes a different count, so solutions are never
 * double-counted. Optionally collects the solutions found.
 */
export function countSolutions(
  board: Board,
  limit = 2,
  start?: Uint8Array,
  found?: number[][]
): number {
  let count = 0;
  const search = (dom: Uint8Array) => {
    if (!propagate(board, dom)) return;
    let branch = -1;
    let best = 4;
    for (let e = 0; e < dom.length; e++) {
      const size = popcount(dom[e]);
      if (size > 1 && size < best) {
        best = size;
        branch = e;
      }
    }
    if (branch === -1) {
      count++;
      found?.push(valuesOf(dom));
      return;
    }
    for (let v = 2; v >= 0; v--) {
      if (!(dom[branch] & BIT[v])) continue;
      const next = dom.slice();
      next[branch] = BIT[v];
      search(next);
      if (count >= limit) return;
    }
  };
  search(start ? start.slice() : initialDomains(board));
  return count;
}

/** One solution of the board, or null if it has none. */
export function solve(board: Board): number[] | null {
  const found: number[][] = [];
  countSolutions(board, 1, undefined, found);
  return found[0] ?? null;
}
