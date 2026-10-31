import { otherEnd } from "./board";
import type { Board, Bridges } from "./types";

/**
 * The rules of Hashi as pure functions over a position:
 *   - a pair of islands holds 0, 1 or 2 bridges;
 *   - bridges never cross one another (and, by construction of the edge list,
 *     never pass over an island);
 *   - every island ends with exactly as many bridges as its number;
 *   - all islands form one connected group.
 */

/** The most bridges a single pair may hold. */
export const MAX_BRIDGES = 2;

/** An empty position for a board. */
export function emptyBridges(board: Board): Bridges {
  return new Array<number>(board.edges.length).fill(0);
}

/** The count after one more tap on a pair: 0 → 1 → 2 → 0. */
export function cycleCount(count: number): number {
  return (count + 1) % (MAX_BRIDGES + 1);
}

/** Bridges currently ending at each island. */
export function islandLoads(board: Board, bridges: Bridges): number[] {
  const loads = new Array<number>(board.islands.length).fill(0);
  board.edges.forEach((edge, e) => {
    const n = bridges[e];
    if (n > 0) {
      loads[edge.a] += n;
      loads[edge.b] += n;
    }
  });
  return loads;
}

/** The first bridge that a bridge on `e` would cross, or -1 if the way is clear. */
export function blockerOf(board: Board, bridges: Bridges, e: number): number {
  for (const f of board.crossings[e]) if (bridges[f] > 0) return f;
  return -1;
}

/** True when no two drawn bridges cross. */
export function noCrossings(board: Board, bridges: Bridges): boolean {
  return board.edges.every((_, e) => bridges[e] === 0 || blockerOf(board, bridges, e) === -1);
}

/**
 * Label each island with the group it belongs to through drawn bridges.
 * Returns the group id per island and the number of groups.
 */
export function groupsOf(board: Board, bridges: Bridges): { groupOf: number[]; count: number } {
  const n = board.islands.length;
  const groupOf = new Array<number>(n).fill(-1);
  let count = 0;
  for (let start = 0; start < n; start++) {
    if (groupOf[start] !== -1) continue;
    groupOf[start] = count;
    const stack = [start];
    while (stack.length > 0) {
      const i = stack.pop() as number;
      for (const e of board.incident[i]) {
        if (bridges[e] === 0) continue;
        const j = otherEnd(board, e, i);
        if (groupOf[j] === -1) {
          groupOf[j] = count;
          stack.push(j);
        }
      }
    }
    count++;
  }
  return { groupOf, count };
}

export interface Evaluation {
  /** Bridges ending at each island. */
  loads: number[];
  /** Island holds exactly its number. */
  satisfied: boolean[];
  /** Island holds more than its number. */
  over: boolean[];
  /** How many islands are satisfied. */
  done: number;
  /** Every island holds exactly its number. */
  allMet: boolean;
  /** Connected groups formed by the drawn bridges. */
  groups: number;
  /** The board is solved: every number met, one group, nothing crossing. */
  won: boolean;
}

export function evaluate(board: Board, bridges: Bridges): Evaluation {
  const loads = islandLoads(board, bridges);
  const satisfied = board.islands.map((isl, i) => loads[i] === isl.need);
  const over = board.islands.map((isl, i) => loads[i] > isl.need);
  const done = satisfied.filter(Boolean).length;
  const allMet = done === board.islands.length;
  const { count: groups } = groupsOf(board, bridges);
  const won = allMet && groups === 1 && noCrossings(board, bridges);
  return { loads, satisfied, over, done, allMet, groups, won };
}

/**
 * Islands a selected island may link to right now: visible neighbours whose
 * line is not blocked by a crossing bridge. (A pair already holding two
 * bridges still counts — another tap clears it.)
 */
export function partnersOf(board: Board, bridges: Bridges, i: number): number[] {
  const out: number[] = [];
  for (const e of board.incident[i]) {
    if (bridges[e] > 0 || blockerOf(board, bridges, e) === -1) out.push(otherEnd(board, e, i));
  }
  return out;
}
