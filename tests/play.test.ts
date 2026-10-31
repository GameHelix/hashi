import { describe, expect, it } from "vitest";
import { edgeBetween } from "@/lib/game/board";
import { createPlayState, formatTime, playReducer, type PlayAction, type PlayState } from "@/lib/game/play";
import { DOUBLE, loosePuzzle, puzzleFrom } from "./fixtures";

// 2 . 3 . 1 — islands 0, 1, 2; the answer is a double then a single.
const puzzle = puzzleFrom(DOUBLE);
const LEFT = edgeBetween(puzzle, 0, 1);
const RIGHT = edgeBetween(puzzle, 1, 2);

// Two arms that cross in the middle, joined at the top-left corner.
const crossed = loosePuzzle(["2.2..", ".....", "2...1", ".....", "..1.."]);
const COLUMN = edgeBetween(crossed, 1, 4);
const ROW = edgeBetween(crossed, 2, 3);

function run(state: PlayState, ...actions: PlayAction[]): PlayState {
  return actions.reduce(playReducer, state);
}

describe("play reducer", () => {
  it("starts empty, unselected and playing", () => {
    const s = createPlayState(puzzle);
    expect(s.bridges).toEqual([0, 0]);
    expect(s.selected).toBeNull();
    expect(s.status).toBe("playing");
  });

  it("cycles a pair 0 → 1 → 2 → 0 when dragging between the same islands", () => {
    let s = createPlayState(puzzle);
    const counts: number[] = [];
    for (let k = 0; k < 3; k++) {
      s = playReducer(s, { type: "link", from: 0, to: 1 });
      counts.push(s.bridges[LEFT]);
    }
    expect(counts).toEqual([1, 2, 0]);
    expect(s.voice).toBe("remove");
  });

  it("links with tap-then-tap and keeps the first island selected", () => {
    let s = run(createPlayState(puzzle), { type: "tapIsland", island: 0 });
    expect(s.selected).toBe(0);
    expect(s.voice).toBe("select");
    s = playReducer(s, { type: "tapIsland", island: 1 });
    expect(s.bridges[LEFT]).toBe(1);
    expect(s.selected).toBe(0);
    s = playReducer(s, { type: "tapIsland", island: 1 });
    expect(s.bridges[LEFT]).toBe(2);
    expect(s.voice).toBe("complete"); // the 2 just reached its number
    // Tapping the selected island again releases it.
    expect(playReducer(s, { type: "tapIsland", island: 0 }).selected).toBeNull();
  });

  it("moves the selection when tapping an island that is not a partner", () => {
    const far = loosePuzzle(["1...", "....", "...1"]); // diagonal: never partners
    const s = run(createPlayState(far), { type: "tapIsland", island: 0 }, { type: "tapIsland", island: 1 });
    expect(s.selected).toBe(1);
    expect(s.bridges).toEqual([]);
  });

  it("refuses a bridge that would cross another, with a buzz and a flash", () => {
    let s = run(createPlayState(crossed), { type: "link", from: 1, to: 4 });
    expect(s.bridges[COLUMN]).toBe(1);
    const before = s;
    s = playReducer(s, { type: "link", from: 2, to: 3 });
    expect(s.bridges).toEqual(before.bridges);
    expect(s.past).toBe(before.past); // nothing recorded
    expect(s.voice).toBe("reject");
    expect(s.flash).toEqual({ kind: "reject", edge: ROW, blocker: COLUMN });
    expect(s.flashNonce).toBe(before.flashNonce + 1);
  });

  it("taps a drawn bridge to cycle it and right-click/long-press removes it", () => {
    let s = run(createPlayState(puzzle), { type: "link", from: 0, to: 1 });
    s = playReducer(s, { type: "tapEdge", edge: LEFT });
    expect(s.bridges[LEFT]).toBe(2);
    s = playReducer(s, { type: "removeEdge", edge: LEFT });
    expect(s.bridges[LEFT]).toBe(0);
    expect(s.voice).toBe("remove");
  });

  it("clears every bridge at an island", () => {
    let s = run(
      createPlayState(puzzle),
      { type: "link", from: 0, to: 1 },
      { type: "link", from: 1, to: 2 },
      { type: "select", island: 1 }
    );
    s = playReducer(s, { type: "clearIsland" });
    expect(s.bridges).toEqual([0, 0]);
    expect(s.voice).toBe("clear");
  });

  it("moves a keyboard cursor and builds with Shift+arrow", () => {
    let s = playReducer(createPlayState(puzzle), { type: "move", dir: 1 });
    expect(s.selected).toBe(0); // the first arrow press lands on an island
    s = playReducer(s, { type: "move", dir: 1 });
    expect(s.selected).toBe(1);
    s = playReducer(s, { type: "linkDir", dir: 3 }); // build left from the 3
    expect(s.bridges[LEFT]).toBe(1);
    s = playReducer(s, { type: "linkDir", dir: 0 }); // nothing above
    expect(s.voice).toBe("reject");
    expect(s.flash).toEqual({ kind: "nolink", island: 1 });
    expect(s.bridges[LEFT]).toBe(1);
  });

  it("undoes, redoes and restarts (and the restart itself can be undone)", () => {
    let s = run(createPlayState(puzzle), { type: "link", from: 0, to: 1 }, { type: "link", from: 0, to: 1 });
    s = playReducer(s, { type: "undo" });
    expect(s.bridges[LEFT]).toBe(1);
    s = playReducer(s, { type: "redo" });
    expect(s.bridges[LEFT]).toBe(2);
    s = playReducer(s, { type: "restart" });
    expect(s.bridges).toEqual([0, 0]);
    s = playReducer(s, { type: "undo" });
    expect(s.bridges[LEFT]).toBe(2);
    // A new move after undo drops the redo branch.
    s = run(s, { type: "undo" }, { type: "link", from: 1, to: 2 });
    expect(s.future).toEqual([]);
  });

  it("wins only once every number is met and all islands are joined", () => {
    let s = run(createPlayState(puzzle), { type: "link", from: 0, to: 1 }, { type: "link", from: 0, to: 1 });
    expect(s.status).toBe("playing");
    s = playReducer(s, { type: "link", from: 1, to: 2 });
    expect(s.status).toBe("won");
    expect(s.voice).toBe("win");
    // The finished board is frozen.
    const frozen = run(s, { type: "link", from: 1, to: 2 }, { type: "hint" }, { type: "restart" }, { type: "undo" });
    expect(frozen.bridges).toEqual(s.bridges);
  });

  it("counts hints and applies the forced bridge", () => {
    const s = playReducer(createPlayState(puzzle), { type: "hint" });
    expect(s.hints).toBe(1);
    expect(s.bridges[LEFT]).toBe(2);
    expect(s.voice).toBe("hint");
    expect(s.flash).toMatchObject({ kind: "hint", edge: LEFT });
  });

  it("uses a hint to take away a wrong bridge first", () => {
    let s = run(createPlayState(puzzle), { type: "link", from: 1, to: 2 }, { type: "link", from: 1, to: 2 });
    expect(s.bridges[RIGHT]).toBe(2); // one too many
    s = playReducer(s, { type: "hint" });
    expect(s.bridges[RIGHT]).toBe(1);
    expect(s.flash).toMatchObject({ kind: "wrong", edge: RIGHT, count: 2 });
    expect(s.hints).toBe(1);
  });
});

describe("formatTime", () => {
  it("renders m:ss", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(65)).toBe("1:05");
    expect(formatTime(600)).toBe("10:00");
  });
});
