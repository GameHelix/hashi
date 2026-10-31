import { describe, expect, it } from "vitest";
import { edgeBetween, parseBoard } from "@/lib/game/board";
import { emptyBridges, evaluate } from "@/lib/game/rules";
import { flashNotice, hintText, positionStatus } from "@/lib/game/status";
import { DOUBLE, LINE, puzzleFrom, SQUARE_OF_ONES } from "./fixtures";

describe("status line", () => {
  it("invites the first move on an empty board", () => {
    const b = parseBoard(LINE);
    expect(positionStatus(evaluate(b, emptyBridges(b)), 3)).toEqual({
      tone: "info",
      text: "Drag from island to island to build bridges.",
    });
  });

  it("counts the islands still waiting for bridges", () => {
    const b = parseBoard(LINE);
    const bridges = emptyBridges(b);
    bridges[edgeBetween(b, 0, 1)] = 1;
    expect(positionStatus(evaluate(b, bridges), 3).text).toBe("2 islands still need bridges.");
  });

  it("says so when every number is met but the islands are not yet connected", () => {
    const b = parseBoard(SQUARE_OF_ONES);
    const bridges = emptyBridges(b);
    bridges[edgeBetween(b, 0, 1)] = 1;
    bridges[edgeBetween(b, 2, 3)] = 1;
    const status = positionStatus(evaluate(b, bridges), 4);
    expect(status.tone).toBe("warn");
    expect(status.text).toContain("Every number is met");
    expect(status.text).toContain("2 separate groups");
  });

  it("warns about over-full islands", () => {
    const b = parseBoard(LINE);
    const bridges = emptyBridges(b);
    bridges[edgeBetween(b, 0, 1)] = 2;
    expect(positionStatus(evaluate(b, bridges), 3)).toEqual({
      tone: "bad",
      text: "1 island has too many bridges.",
    });
  });

  it("celebrates a solved board", () => {
    const p = puzzleFrom(DOUBLE);
    expect(positionStatus(evaluate(p, p.solution), 3).tone).toBe("good");
  });

  it("explains hints and refused bridges", () => {
    const p = puzzleFrom(DOUBLE);
    const left = edgeBetween(p, 0, 1);
    expect(hintText(p, { kind: "add", edge: left, count: 2, reason: "capacity", island: 0 })).toBe(
      "Hint: this double bridge is forced — the 2 at row 1, column 1 cannot reach its number any other way."
    );
    expect(hintText(p, { kind: "remove", edge: left, count: 0, reason: "wrong", island: -1 })).toContain(
      "was wrong"
    );
    expect(flashNotice(p, { kind: "reject", edge: left, blocker: left }).text).toContain("can't cross");
    expect(flashNotice(p, { kind: "nolink", island: 0 }).tone).toBe("bad");
  });
});
