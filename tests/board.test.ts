import { describe, expect, it } from "vitest";
import { buildBoard, edgeBetween, hitTest, otherEnd, parseBoard, stepIsland } from "@/lib/game/board";
import { PLUS, SQUARE_OF_THREES } from "./fixtures";

describe("board geometry", () => {
  it("parses islands in row-major order with their numbers", () => {
    const b = parseBoard(["2.3", "...", "1.4"]);
    expect(b.rows).toBe(3);
    expect(b.cols).toBe(3);
    expect(b.islands).toEqual([
      { r: 0, c: 0, need: 2 },
      { r: 0, c: 2, need: 3 },
      { r: 2, c: 0, need: 1 },
      { r: 2, c: 2, need: 4 },
    ]);
    expect(b.islandAt[0]).toBe(0);
    expect(b.islandAt[8]).toBe(3);
    expect(b.islandAt[4]).toBe(-1);
  });

  it("links each island to the nearest island it can see in each direction", () => {
    const b = parseBoard(SQUARE_OF_THREES);
    expect(b.edges).toHaveLength(4);
    const top = edgeBetween(b, 0, 1);
    const left = edgeBetween(b, 0, 2);
    expect(top).not.toBe(-1);
    expect(left).not.toBe(-1);
    expect(b.edges[top].horizontal).toBe(true);
    expect(b.edges[left].horizontal).toBe(false);
    expect(b.links[0]).toEqual([-1, top, left, -1]); // up, right, down, left
    expect(b.links[1][3]).toBe(top);
    expect(b.edges[top].cells).toEqual([1]); // the water between them
    // Diagonal islands never see each other.
    expect(edgeBetween(b, 0, 3)).toBe(-1);
    expect(otherEnd(b, top, 0)).toBe(1);
    expect(otherEnd(b, top, 1)).toBe(0);
  });

  it("lets an island in between block the line of sight", () => {
    const b = parseBoard(["1.2.1"]);
    expect(b.edges).toHaveLength(2);
    expect(edgeBetween(b, 0, 2)).toBe(-1);
    expect(edgeBetween(b, 0, 1)).not.toBe(-1);
    expect(edgeBetween(b, 1, 2)).not.toBe(-1);
  });

  it("treats directly adjacent islands as a pair with no water between", () => {
    const b = parseBoard(["12"]);
    expect(b.edges).toHaveLength(1);
    expect(b.edges[0].cells).toEqual([]);
  });

  it("finds bridges that would cross", () => {
    const b = parseBoard(PLUS);
    const h = edgeBetween(b, 1, 2); // the middle row
    const v = edgeBetween(b, 0, 3); // the middle column
    expect(b.crossings[h]).toEqual([v]);
    expect(b.crossings[v]).toEqual([h]);
    // Bridges that merely meet at an island never cross.
    const sq = parseBoard(SQUARE_OF_THREES);
    expect(sq.crossings.every((x) => x.length === 0)).toBe(true);
  });

  it("rejects malformed layouts", () => {
    expect(() => buildBoard(2, 2, [{ r: 2, c: 0, need: 1 }])).toThrow();
    expect(() =>
      buildBoard(2, 2, [
        { r: 0, c: 0, need: 1 },
        { r: 0, c: 0, need: 2 },
      ])
    ).toThrow();
  });

  it("steps the keyboard cursor to the next island in a direction", () => {
    const b = parseBoard(["1...1", ".....", "..2..", ".....", "1...1"]);
    // islands: 0 (0,0), 1 (0,4), 2 (2,2), 3 (4,0), 4 (4,4)
    expect(stepIsland(b, 0, 1)).toBe(1); // visible neighbour to the right
    expect(stepIsland(b, 0, 2)).toBe(3); // visible neighbour below
    expect(stepIsland(b, 2, 0)).toBe(0); // nothing straight up: nearest island above
    expect(stepIsland(b, 0, 0)).toBe(-1); // nothing above the top row
  });

  it("hit-tests islands by cell and bridges by a band around their line", () => {
    const b = parseBoard(["1...1"]);
    const none = () => false;
    const all = () => true;
    expect(hitTest(b, 0.5, 0.5, none)).toEqual({ kind: "island", id: 0 });
    expect(hitTest(b, 0.95, 0.1, none)).toEqual({ kind: "island", id: 0 });
    expect(hitTest(b, 2.5, 0.5, none)).toBeNull(); // open water, no bridge drawn
    expect(hitTest(b, 2.5, 0.6, all)).toEqual({ kind: "edge", id: 0 });
    expect(hitTest(b, 2.5, 0.95, all)).toBeNull(); // too far from the line
    expect(hitTest(b, -3, -3, all)).toBeNull();
  });
});
