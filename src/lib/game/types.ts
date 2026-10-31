/**
 * Core Hashi types — pure data, no React, no DOM.
 *
 * A board is a `rows × cols` grid holding numbered islands. Two islands that
 * can see each other along a row or column (nothing in between) form an
 * **edge**: the only places a bridge may ever go. A position is simply the
 * bridge count (0, 1 or 2) on every edge, which keeps the solver, the hint
 * engine, undo history and the renderer all working on one flat array.
 */

export type Difficulty = "easy" | "medium" | "hard" | "expert";

/** Directions, indexed so that `(d + 2) % 4` is the opposite one. */
export type Dir = 0 | 1 | 2 | 3;

export interface Island {
  r: number;
  c: number;
  /** How many bridges must end here, 1..8. */
  need: number;
}

export interface Edge {
  /** Island index at the left (horizontal) or top (vertical) end. */
  a: number;
  /** Island index at the right or bottom end. */
  b: number;
  horizontal: boolean;
  /** Grid cells (`r * cols + c`) strictly between the two islands. */
  cells: number[];
}

export interface Board {
  rows: number;
  cols: number;
  /** Islands in row-major order. */
  islands: Island[];
  /** Every visible island pair, i.e. every place a bridge could go. */
  edges: Edge[];
  /** `links[i][d]`: the edge leaving island `i` in direction `d`, or -1. */
  links: number[][];
  /** `incident[i]`: the edges touching island `i` (at most four). */
  incident: number[][];
  /** `crossings[e]`: edges whose bridges would cross a bridge on `e`. */
  crossings: number[][];
  /** `islandAt[r * cols + c]`: the island on that cell, or -1. */
  islandAt: number[];
}

export interface Puzzle extends Board {
  difficulty: Difficulty;
  /** The seed the board was generated from, for reproducibility. */
  seed: string;
  /** The unique solution: bridge count per edge. */
  solution: number[];
}

/** A player position: bridges (0, 1 or 2) per edge of the board. */
export type Bridges = number[];
