import { describe, expect, it } from "vitest";
import { buildBoard, edgeBetween, parseBoard } from "@/lib/game/board";
import { makeRng } from "@/lib/game/rng";
import { evaluate } from "@/lib/game/rules";
import {
  countSolutions,
  domainsFrom,
  gradeBoard,
  high,
  initialDomains,
  isDetermined,
  low,
  propagate,
  solve,
  valuesOf,
  type Narrowing,
} from "@/lib/game/solver";
import {
  BARBELL,
  DOUBLE,
  LINE,
  MISMATCH,
  NEEDS_CONNECTIVITY,
  PLUS,
  SQUARE_OF_ONES,
  SQUARE_OF_THREES,
} from "./fixtures";

describe("solver", () => {
  describe("hand-made boards with a unique answer", () => {
    it("solves a simple line", () => {
      const b = parseBoard(LINE);
      expect(countSolutions(b)).toBe(1);
      expect(solve(b)).toEqual([1, 1]);
    });

    it("finds the forced double bridge", () => {
      const b = parseBoard(DOUBLE);
      expect(countSolutions(b)).toBe(1);
      const s = solve(b) as number[];
      expect(s[edgeBetween(b, 0, 1)]).toBe(2);
      expect(s[edgeBetween(b, 1, 2)]).toBe(1);
    });

    it("needs connectivity to rule out a filling that splits the board", () => {
      const b = parseBoard(NEEDS_CONNECTIVITY); // 1 2 / 1 2
      expect(countSolutions(b)).toBe(1);
      const s = solve(b) as number[];
      expect(s[edgeBetween(b, 0, 1)]).toBe(1); // top
      expect(s[edgeBetween(b, 1, 3)]).toBe(1); // right
      expect(s[edgeBetween(b, 2, 3)]).toBe(1); // bottom
      expect(s[edgeBetween(b, 0, 2)]).toBe(0); // left: two 1s may not close a pair
      expect(evaluate(b, s).won).toBe(true);
      // Counting alone cannot finish it; the isolation rule can.
      const dom = initialDomains(b);
      expect(propagate(b, dom, { connectivity: false })).toBe(true);
      expect(isDetermined(dom)).toBe(false);
      expect(propagate(b, dom)).toBe(true);
      expect(isDetermined(dom)).toBe(true);
      expect(valuesOf(dom)).toEqual(s);
    });
  });

  describe("hand-made boards with several answers", () => {
    it("counts both fillings of a square of 3s", () => {
      const b = parseBoard(SQUARE_OF_THREES);
      const found: number[][] = [];
      expect(countSolutions(b, 5, undefined, found)).toBe(2);
      const top = edgeBetween(b, 0, 1);
      expect(found.map((s) => s[top]).sort()).toEqual([1, 2]);
      for (const s of found) expect(evaluate(b, s).won).toBe(true);
    });

    it("stops counting at the limit", () => {
      expect(countSolutions(parseBoard(SQUARE_OF_THREES), 1)).toBe(1);
    });
  });

  describe("hand-made boards with no answer", () => {
    it("rejects numbers that disagree on their only bridge", () => {
      const b = parseBoard(MISMATCH);
      expect(countSolutions(b)).toBe(0);
      expect(solve(b)).toBeNull();
    });

    it("rejects a board whose numbers can only be met by two separate groups", () => {
      expect(countSolutions(parseBoard(SQUARE_OF_ONES))).toBe(0);
    });

    it("rejects a board whose forced bridges would cross", () => {
      expect(countSolutions(parseBoard(PLUS))).toBe(0);
    });
  });

  describe("propagation rules", () => {
    it("caps each pair by both islands' numbers", () => {
      const b = parseBoard(["1.3"]);
      const dom = initialDomains(b);
      expect(high(dom[0])).toBe(1);
      expect(low(dom[0])).toBe(0);
    });

    it("clears every pair crossing a pair that must hold a bridge", () => {
      // The top 1 has a single partner, so the column bridge is forced; the
      // row pair crossing it must then stay empty, and the 2s starve.
      const b = parseBoard([".1.", "2.2", ".1."]);
      const trace: Narrowing[] = [];
      expect(propagate(b, initialDomains(b), { connectivity: false, trace })).toBe(false);
      const crossing = trace.find((t) => t.rule === "crossing");
      expect(crossing?.edge).toBe(edgeBetween(b, 1, 2));
      expect(crossing?.after).toBe(1); // only "0 bridges" left
    });

    it("forces the only route between two parts of the board (cut rule)", () => {
      const b = parseBoard(BARBELL);
      const route = edgeBetween(b, 3, 4); // the 3 and the 2 on the middle row
      const dom = initialDomains(b);
      expect(propagate(b, dom, { connectivity: false })).toBe(true);
      expect(low(dom[route])).toBe(0); // counting alone leaves it open
      const trace: Narrowing[] = [];
      expect(propagate(b, dom, { trace })).toBe(true);
      const first = trace.find((t) => t.rule === "cut" || t.rule === "isolation");
      expect(first?.rule).toBe("cut");
      expect(first?.edge).toBe(route);
      expect(isDetermined(dom)).toBe(true);
      expect(valuesOf(dom)[route]).toBeGreaterThanOrEqual(1);
      expect(countSolutions(b)).toBe(1);
    });

    it("reasons forward from a partial position", () => {
      const b = parseBoard(SQUARE_OF_THREES);
      const top = edgeBetween(b, 0, 1);
      const bridges = b.edges.map(() => 0);
      bridges[top] = 2; // pins the "2 across, 1 down" answer
      const dom = domainsFrom(b, bridges);
      expect(propagate(b, dom)).toBe(true);
      expect(isDetermined(dom)).toBe(true);
      expect(valuesOf(dom)[edgeBetween(b, 2, 3)]).toBe(2);
      expect(valuesOf(dom)[edgeBetween(b, 0, 2)]).toBe(1);
    });

    it("never removes the true answer while narrowing", () => {
      const b = parseBoard(NEEDS_CONNECTIVITY);
      const s = solve(b) as number[];
      const dom = initialDomains(b);
      propagate(b, dom);
      s.forEach((v, e) => expect(dom[e] & (1 << v)).not.toBe(0));
    });
  });

  describe("against a brute-force oracle", () => {
    /** Count solutions by trying every assignment against the plain rules. */
    function bruteForce(board: ReturnType<typeof buildBoard>): number {
      const m = board.edges.length;
      const bridges = new Array<number>(m).fill(0);
      let count = 0;
      const total = 3 ** m;
      for (let code = 0; code < total; code++) {
        let x = code;
        for (let e = 0; e < m; e++) {
          bridges[e] = x % 3;
          x = Math.floor(x / 3);
        }
        if (evaluate(board, bridges).won) count++;
      }
      return count;
    }

    it("agrees on the exact solution count of many random small boards", () => {
      const rng = makeRng("oracle");
      const tally = { none: 0, one: 0, many: 0 };
      let checked = 0;
      while (checked < 300) {
        const size = rng.int(3, 5);
        const islands: { r: number; c: number; need: number }[] = [];
        const taken = new Set<number>();
        const k = rng.int(3, 6);
        while (islands.length < k) {
          const r = rng.int(0, size - 1);
          const c = rng.int(0, size - 1);
          if (taken.has(r * size + c)) continue;
          taken.add(r * size + c);
          islands.push({ r, c, need: rng.int(1, 4) });
        }
        let board = buildBoard(size, size, islands);
        if (board.edges.length > 9) continue;
        if (checked % 2 === 1) {
          // Half the samples take their numbers from a random non-crossing
          // filling, so ambiguous and unique boards turn up, not only
          // impossible ones.
          const fill = board.edges.map(() => 0);
          for (const e of rng.shuffle(board.edges.map((_, id) => id))) {
            if (board.crossings[e].every((f) => fill[f] === 0)) fill[e] = rng.int(0, 2);
          }
          const loads = board.islands.map(() => 0);
          board.edges.forEach((edge, e) => {
            loads[edge.a] += fill[e];
            loads[edge.b] += fill[e];
          });
          board = buildBoard(
            size,
            size,
            board.islands.map((isl, i) => ({ ...isl, need: Math.max(1, loads[i]) }))
          );
        }
        const expected = bruteForce(board);
        expect(countSolutions(board, 1000)).toBe(expected);
        tally[expected === 0 ? "none" : expected === 1 ? "one" : "many"]++;
        checked++;
      }
      // The sample really exercises all three outcomes.
      expect(tally.none).toBeGreaterThan(0);
      expect(tally.one).toBeGreaterThan(0);
      expect(tally.many).toBeGreaterThan(0);
    });
  });

  describe("grading", () => {
    it("grades by the weakest rules that finish the board", () => {
      expect(gradeBoard(parseBoard(DOUBLE))).toBe("basic");
      expect(gradeBoard(parseBoard(NEEDS_CONNECTIVITY))).toBe("connected");
      expect(gradeBoard(parseBoard(SQUARE_OF_THREES))).toBe("search"); // two answers
      expect(gradeBoard(parseBoard(MISMATCH))).toBe("search"); // no answer
    });
  });
});
