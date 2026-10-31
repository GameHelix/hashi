import { describe, expect, it } from "vitest";
import { DIFFICULTIES, LEVELS } from "@/lib/game/constants";
import { generatePuzzle } from "@/lib/game/generator";
import { groupsOf, islandLoads, noCrossings } from "@/lib/game/rules";
import { countSolutions, gradeBoard, solve } from "@/lib/game/solver";
import type { Puzzle } from "@/lib/game/types";

/** Boards checked per difficulty; each one is proven unique by search. */
const SEEDS = 30;

function sameBoard(a: Puzzle, b: Puzzle): boolean {
  return JSON.stringify([a.islands, a.solution]) === JSON.stringify([b.islands, b.solution]);
}

describe("puzzle generator", () => {
  for (const difficulty of DIFFICULTIES) {
    describe(difficulty, () => {
      const level = LEVELS[difficulty];
      const puzzles = Array.from({ length: SEEDS }, (_, k) =>
        generatePuzzle({ difficulty, seed: `gen-${difficulty}-${k}` })
      );

      it("uses the level's grid and island count", () => {
        for (const p of puzzles) {
          expect(p.rows).toBe(level.size);
          expect(p.cols).toBe(level.size);
          expect(p.difficulty).toBe(difficulty);
          expect(p.islands.length).toBeGreaterThanOrEqual(level.islands[0]);
          expect(p.islands.length).toBeLessThanOrEqual(level.islands[1]);
        }
      });

      it("writes numbers that match the bridges of its solution", () => {
        for (const p of puzzles) {
          const loads = islandLoads(p, p.solution);
          p.islands.forEach((isl, i) => {
            expect(isl.need).toBeGreaterThanOrEqual(1);
            expect(isl.need).toBeLessThanOrEqual(8);
            expect(loads[i]).toBe(isl.need);
          });
          for (const n of p.solution) expect([0, 1, 2]).toContain(n);
        }
      });

      it("has a connected solution with no crossing bridges", () => {
        for (const p of puzzles) {
          expect(groupsOf(p, p.solution).count).toBe(1);
          expect(noCrossings(p, p.solution)).toBe(true);
        }
      });

      it("is proven uniquely solvable, and the solver finds the stored answer", () => {
        for (const p of puzzles) {
          expect(countSolutions(p, 2)).toBe(1);
          expect(solve(p)).toEqual(p.solution);
        }
      });

      it("keeps islands apart and spreads them edge to edge", () => {
        for (const p of puzzles) {
          for (const isl of p.islands) {
            for (const [dr, dc] of [
              [0, 1],
              [1, 0],
            ]) {
              const r = isl.r + dr;
              const c = isl.c + dc;
              if (r < p.rows && c < p.cols) expect(p.islandAt[r * p.cols + c]).toBe(-1);
            }
          }
          const rows = new Set(p.islands.map((i) => i.r));
          const cols = new Set(p.islands.map((i) => i.c));
          expect(rows.has(0) && rows.has(p.rows - 1)).toBe(true);
          expect(cols.has(0) && cols.has(p.cols - 1)).toBe(true);
        }
      });

      if (difficulty === "easy" || difficulty === "medium") {
        it("can be finished by deduction alone, without guessing or lookahead", () => {
          for (const p of puzzles) expect(["basic", "connected"]).toContain(gradeBoard(p));
        });
      } else {
        it("can be finished by deduction, with at most a one-step lookahead", () => {
          for (const p of puzzles) expect(gradeBoard(p)).not.toBe("search");
        });
      }
    });
  }

  it("is reproducible from a seed", () => {
    for (const difficulty of DIFFICULTIES) {
      const a = generatePuzzle({ difficulty, seed: "repro" });
      const b = generatePuzzle({ difficulty, seed: "repro" });
      expect(sameBoard(a, b)).toBe(true);
      expect(a.seed).toBe("repro");
    }
    // Numeric and string seeds are both accepted.
    expect(sameBoard(generatePuzzle({ difficulty: "easy", seed: 42 }), generatePuzzle({ difficulty: "easy", seed: "42" }))).toBe(true);
  });

  it("gives different boards for different seeds", () => {
    const boards = ["a", "b", "c", "d"].map((seed) => generatePuzzle({ difficulty: "medium", seed }));
    for (let i = 0; i < boards.length; i++) {
      for (let j = i + 1; j < boards.length; j++) expect(sameBoard(boards[i], boards[j])).toBe(false);
    }
  });

  it("makes harder levels need more reasoning than Easy", () => {
    const grades = (difficulty: (typeof DIFFICULTIES)[number]) =>
      Array.from({ length: 12 }, (_, k) => gradeBoard(generatePuzzle({ difficulty, seed: `g${k}` })));
    // Easy falls to counting alone; Expert boards lean on connectivity or lookahead.
    expect(grades("easy").every((g) => g === "basic")).toBe(true);
    expect(grades("expert").every((g) => g === "connected" || g === "lookahead")).toBe(true);
  });

  it("generates the biggest boards well inside the time budget", () => {
    const times: number[] = [];
    for (let k = 0; k < 12; k++) {
      const start = performance.now();
      generatePuzzle({ difficulty: "expert", seed: `speed-${k}` });
      times.push(performance.now() - start);
    }
    const worst = Math.max(...times);
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    // Budget is ~1.5 s per board; in practice a board takes milliseconds.
    expect(worst).toBeLessThan(1500);
    expect(mean).toBeLessThan(300);
  });
});
