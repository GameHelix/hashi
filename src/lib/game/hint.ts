import { domainsFrom, lookahead, low, propagate, type Narrowing, type Rule } from "./solver";
import type { Bridges, Puzzle } from "./types";

export interface Hint {
  /** `remove`: a drawn bridge is wrong. `add`: a bridge is forced. */
  kind: "remove" | "add";
  edge: number;
  /** The count the pair should hold after the hint. */
  count: number;
  /**
   * Why: `wrong` for a bridge the solution does not have, a solver rule for a
   * deduction, or `solution` for the last-resort reveal.
   */
  reason: Rule | "wrong" | "solution";
  /** The island whose number drove the deduction, or -1. */
  island: number;
}

type Stage = (dom: Uint8Array, trace: Narrowing[]) => boolean;

/**
 * Find the most useful next step for the player.
 *
 * 1. A bridge beyond what the (unique) solution has on that pair is wrong, and
 *    is pointed out before anything else — reasoning forward from a wrong
 *    position would only mislead.
 * 2. Otherwise reason forward from the position on screen, gentlest rules
 *    first (counting, then connectivity, then lookahead), and return the first
 *    pair whose minimum rises above what is drawn: a bridge that is genuinely
 *    forced right now. Propagation visits islands in reading order, so the
 *    first such step is also the one needing the least context.
 * 3. On a board the rules cannot crack (never the case for generated boards)
 *    fall back to revealing one missing solution bridge.
 */
export function findHint(puzzle: Puzzle, bridges: Bridges): Hint | null {
  for (let e = 0; e < bridges.length; e++) {
    if (bridges[e] > puzzle.solution[e]) {
      return { kind: "remove", edge: e, count: puzzle.solution[e], reason: "wrong", island: -1 };
    }
  }
  if (bridges.every((n, e) => n === puzzle.solution[e])) return null;

  const stages: Stage[] = [
    (dom, trace) => propagate(puzzle, dom, { connectivity: false, trace }),
    (dom, trace) => propagate(puzzle, dom, { trace }),
    (dom, trace) => lookahead(puzzle, dom, { trace }),
  ];
  const dom = domainsFrom(puzzle, bridges);
  for (const stage of stages) {
    const trace: Narrowing[] = [];
    if (!stage(dom, trace)) break;
    for (const step of trace) {
      const forced = low(step.after);
      if (forced > bridges[step.edge]) {
        return { kind: "add", edge: step.edge, count: forced, reason: step.rule, island: step.island };
      }
    }
  }

  for (let e = 0; e < bridges.length; e++) {
    if (puzzle.solution[e] > bridges[e]) {
      return { kind: "add", edge: e, count: bridges[e] + 1, reason: "solution", island: -1 };
    }
  }
  return null;
}
