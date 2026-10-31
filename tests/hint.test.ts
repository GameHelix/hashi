import { describe, expect, it } from "vitest";
import { edgeBetween } from "@/lib/game/board";
import { DIFFICULTIES } from "@/lib/game/constants";
import { generatePuzzle } from "@/lib/game/generator";
import { findHint } from "@/lib/game/hint";
import { emptyBridges, evaluate } from "@/lib/game/rules";
import { countSolutions, domainsFrom } from "@/lib/game/solver";
import type { Bridges, Puzzle } from "@/lib/game/types";
import { DOUBLE, NEEDS_CONNECTIVITY, puzzleFrom } from "./fixtures";

/**
 * A hinted count is genuinely forced when no solution extending the current
 * position gives that pair fewer bridges. Checked by exhaustive search,
 * independently of the propagation that produced the hint.
 */
function isForced(p: Puzzle, bridges: Bridges, edge: number, count: number): boolean {
  const dom = domainsFrom(p, bridges);
  dom[edge] &= (1 << count) - 1; // only counts below the hinted one
  return dom[edge] === 0 || countSolutions(p, 1, dom) === 0;
}

describe("hint engine", () => {
  it("names the island and count behind a simple forced double", () => {
    const p = puzzleFrom(DOUBLE); // 2 . 3 . 1
    const hint = findHint(p, emptyBridges(p));
    expect(hint).toEqual({
      kind: "add",
      edge: edgeBetween(p, 0, 1),
      count: 2,
      reason: "capacity",
      island: 0,
    });
  });

  it("gives a forced bridge on a board that needs connectivity reasoning", () => {
    const p = puzzleFrom(NEEDS_CONNECTIVITY);
    const hint = findHint(p, emptyBridges(p));
    expect(hint?.kind).toBe("add");
    expect(hint && hint.count <= p.solution[hint.edge]).toBe(true);
    expect(hint && isForced(p, emptyBridges(p), hint.edge, hint.count)).toBe(true);
  });

  it("points at a wrong bridge before anything else", () => {
    const p = puzzleFrom(NEEDS_CONNECTIVITY);
    const left = edgeBetween(p, 0, 2); // the solution leaves the two 1s unjoined
    const bridges = emptyBridges(p);
    bridges[left] = 1;
    expect(findHint(p, bridges)).toEqual({ kind: "remove", edge: left, count: 0, reason: "wrong", island: -1 });
  });

  it("trims a pair that holds one bridge too many", () => {
    const p = puzzleFrom(DOUBLE);
    const right = edgeBetween(p, 1, 2); // the solution has one bridge here
    const bridges = p.solution.slice();
    bridges[right] = 2;
    expect(findHint(p, bridges)).toMatchObject({ kind: "remove", edge: right, count: 1 });
  });

  it("returns nothing once the board is solved", () => {
    const p = puzzleFrom(DOUBLE);
    expect(findHint(p, p.solution)).toBeNull();
  });

  for (const difficulty of DIFFICULTIES) {
    it(`solves ${difficulty} boards hint by hint, every hint genuinely forced`, () => {
      for (let k = 0; k < 3; k++) {
        const p = generatePuzzle({ difficulty, seed: `hint-${difficulty}-${k}` });
        const bridges = emptyBridges(p);
        let guard = 0;
        while (!evaluate(p, bridges).won) {
          const hint = findHint(p, bridges);
          expect(hint).not.toBeNull();
          if (!hint) break;
          expect(hint.kind).toBe("add");
          expect(hint.reason).not.toBe("solution"); // deduced, never just revealed
          expect(hint.count).toBeGreaterThan(bridges[hint.edge]);
          expect(hint.count).toBeLessThanOrEqual(p.solution[hint.edge]);
          // Spot-check forcedness by exhaustive search (cheap on early hints).
          if (guard < 4) expect(isForced(p, bridges, hint.edge, hint.count)).toBe(true);
          bridges[hint.edge] = hint.count;
          if (++guard > 200) throw new Error("hints did not converge");
        }
        expect(bridges).toEqual(p.solution);
        expect(findHint(p, bridges)).toBeNull();
      }
    });
  }

  it("deduces from the player's progress, not from the empty board", () => {
    const p = generatePuzzle({ difficulty: "medium", seed: "hint-progress" });
    // Lay down half of the solution, then ask: the hint must add something new.
    const bridges = emptyBridges(p);
    p.solution.forEach((n, e) => {
      if (e % 2 === 0) bridges[e] = n;
    });
    const hint = findHint(p, bridges);
    expect(hint?.kind).toBe("add");
    expect(hint && hint.count > bridges[hint.edge]).toBe(true);
    expect(hint && isForced(p, bridges, hint.edge, hint.count)).toBe(true);
  });
});
