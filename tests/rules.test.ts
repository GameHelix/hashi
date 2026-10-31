import { describe, expect, it } from "vitest";
import { edgeBetween, parseBoard } from "@/lib/game/board";
import {
  blockerOf,
  cycleCount,
  emptyBridges,
  evaluate,
  groupsOf,
  islandLoads,
  noCrossings,
  partnersOf,
} from "@/lib/game/rules";
import { LINE, PLUS, SQUARE_OF_ONES, SQUARE_OF_THREES } from "./fixtures";

describe("rules", () => {
  it("cycles a pair through 0, 1, 2 and back to 0", () => {
    expect(cycleCount(0)).toBe(1);
    expect(cycleCount(1)).toBe(2);
    expect(cycleCount(2)).toBe(0);
  });

  describe("crossing", () => {
    const b = parseBoard(PLUS);
    const h = edgeBetween(b, 1, 2);
    const v = edgeBetween(b, 0, 3);

    it("reports the bridge that blocks a line", () => {
      const bridges = emptyBridges(b);
      expect(blockerOf(b, bridges, v)).toBe(-1);
      bridges[h] = 1;
      expect(blockerOf(b, bridges, v)).toBe(h);
      expect(blockerOf(b, bridges, h)).toBe(-1); // nothing crosses h yet
    });

    it("flags a position where two bridges cross", () => {
      const bridges = emptyBridges(b);
      bridges[h] = 1;
      expect(noCrossings(b, bridges)).toBe(true);
      bridges[v] = 2;
      expect(noCrossings(b, bridges)).toBe(false);
    });

    it("does not offer a blocked partner to a selected island", () => {
      const bridges = emptyBridges(b);
      expect(partnersOf(b, bridges, 0)).toEqual([3]);
      bridges[h] = 1;
      expect(partnersOf(b, bridges, 0)).toEqual([]);
      // A pair that already holds bridges stays tappable (to cycle it off).
      expect(partnersOf(b, bridges, 1)).toEqual([2]);
    });
  });

  describe("capacity", () => {
    const b = parseBoard(LINE);

    it("counts the bridges ending at each island", () => {
      const bridges = emptyBridges(b);
      bridges[edgeBetween(b, 0, 1)] = 2;
      bridges[edgeBetween(b, 1, 2)] = 1;
      expect(islandLoads(b, bridges)).toEqual([2, 3, 1]);
    });

    it("marks islands that are exactly met and those over their number", () => {
      const bridges = emptyBridges(b);
      bridges[edgeBetween(b, 0, 1)] = 2; // the left 1 now holds 2
      const ev = evaluate(b, bridges);
      expect(ev.over).toEqual([true, false, false]);
      expect(ev.satisfied).toEqual([false, true, false]);
      expect(ev.done).toBe(1);
      expect(ev.allMet).toBe(false);
      expect(ev.won).toBe(false);
    });
  });

  describe("connectivity", () => {
    it("labels the groups formed by drawn bridges", () => {
      const b = parseBoard(SQUARE_OF_THREES); // islands 0 1 / 2 3
      const bridges = emptyBridges(b);
      expect(groupsOf(b, bridges).count).toBe(4);
      bridges[edgeBetween(b, 0, 1)] = 1;
      bridges[edgeBetween(b, 2, 3)] = 2;
      const g = groupsOf(b, bridges);
      expect(g.count).toBe(2);
      expect(g.groupOf[0]).toBe(g.groupOf[1]);
      expect(g.groupOf[2]).toBe(g.groupOf[3]);
      expect(g.groupOf[0]).not.toBe(g.groupOf[2]);
    });

    it("does not count a win when every number is met but the board is split", () => {
      const b = parseBoard(SQUARE_OF_ONES);
      const bridges = emptyBridges(b);
      bridges[edgeBetween(b, 0, 1)] = 1;
      bridges[edgeBetween(b, 2, 3)] = 1;
      const ev = evaluate(b, bridges);
      expect(ev.allMet).toBe(true);
      expect(ev.groups).toBe(2);
      expect(ev.won).toBe(false);
    });
  });

  describe("win", () => {
    it("is won only when every number is met and all islands are one group", () => {
      const b = parseBoard(SQUARE_OF_THREES);
      const bridges = emptyBridges(b);
      bridges[edgeBetween(b, 0, 1)] = 1;
      bridges[edgeBetween(b, 2, 3)] = 1;
      bridges[edgeBetween(b, 0, 2)] = 2;
      expect(evaluate(b, bridges).won).toBe(false); // the right side is short
      bridges[edgeBetween(b, 1, 3)] = 2;
      const ev = evaluate(b, bridges);
      expect(ev.allMet).toBe(true);
      expect(ev.groups).toBe(1);
      expect(ev.won).toBe(true);
    });

    it("is never won with crossing bridges, even if counts and connection work out", () => {
      // The corner 2 joins both arms, so this filling meets every number and
      // is one group — but the two long bridges cross in the middle.
      const b = parseBoard(["2.2..", ".....", "2...1", ".....", "..1.."]);
      // islands: 0 (0,0) corner, 1 (0,2), 2 (2,0), 3 (2,4), 4 (4,2)
      const bridges = emptyBridges(b);
      bridges[edgeBetween(b, 0, 1)] = 1;
      bridges[edgeBetween(b, 0, 2)] = 1;
      bridges[edgeBetween(b, 1, 4)] = 1;
      bridges[edgeBetween(b, 2, 3)] = 1;
      const ev = evaluate(b, bridges);
      expect(ev.allMet).toBe(true);
      expect(ev.groups).toBe(1);
      expect(noCrossings(b, bridges)).toBe(false);
      expect(ev.won).toBe(false);
    });
  });
});
