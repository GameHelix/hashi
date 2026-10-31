import { parseBoard } from "@/lib/game/board";
import { countSolutions } from "@/lib/game/solver";
import type { Board, Puzzle } from "@/lib/game/types";

/**
 * Hand-made boards with known answers. In the text layouts a digit is an
 * island with that number and a dot is water.
 */

/** Two islands on a line, joined by one bridge each side of the middle. */
export const LINE = ["1.2.1"];

/** A corner 2 with a single neighbour forces a double bridge. */
export const DOUBLE = ["2.3.1"];

/** A square of 3s: top/bottom 1 with sides 2, or the reverse. Two answers. */
export const SQUARE_OF_THREES = ["3.3", "...", "3.3"];

/** Numbers that cannot agree on their only bridge. */
export const MISMATCH = ["2.1"];

/** A square of 1s: every way to meet the numbers leaves two separate pairs. */
export const SQUARE_OF_ONES = ["1.1", "...", "...", "1.1"];

/** Two forced bridges that would have to cross. */
export const PLUS = [".1.", "1.1", ".1."];

/**
 * Counting alone allows two fillings, but one splits the board in two, so
 * only connectivity reasoning finds the answer (top, right and bottom single).
 */
export const NEEDS_CONNECTIVITY = ["1.2", "...", "1.2"];

/**
 * Two clusters that can only meet through the 3 and the 2 on the middle row:
 * counting leaves that pair open, the cut rule forces it.
 */
export const BARBELL = ["1.1......", ".........", "2.3...2.1", ".........", "......2.2"];

/** Wrap a board and its (verified unique) solution as a puzzle. */
export function puzzleFrom(lines: readonly string[]): Puzzle {
  const board = parseBoard(lines);
  const found: number[][] = [];
  const n = countSolutions(board, 2, undefined, found);
  if (n !== 1) throw new Error(`fixture has ${n} solutions, expected exactly one`);
  return { ...board, difficulty: "easy", seed: "fixture", solution: found[0] };
}

/** Wrap any board as a puzzle with an all-zero "solution" (for rules-only tests). */
export function loosePuzzle(lines: readonly string[]): Puzzle {
  const board: Board = parseBoard(lines);
  return { ...board, difficulty: "easy", seed: "loose", solution: board.edges.map(() => 0) };
}
