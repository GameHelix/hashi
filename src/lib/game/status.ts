import type { Hint } from "./hint";
import type { Flash } from "./play";
import type { Evaluation } from "./rules";
import type { Puzzle } from "./types";

/**
 * The words under the HUD: a standing summary of the position, and short-lived
 * notices for one-off events (a refused bridge, a hint). Kept pure so the copy
 * that matters — above all "numbers met but not yet connected" — is tested.
 */

export type Tone = "info" | "good" | "warn" | "bad";

export interface StatusLine {
  tone: Tone;
  text: string;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** The standing summary for a position. */
export function positionStatus(evaluation: Evaluation, total: number): StatusLine {
  if (evaluation.won) return { tone: "good", text: "Solved — every island is linked into one network!" };
  if (evaluation.allMet && evaluation.groups > 1) {
    return {
      tone: "warn",
      text: `Every number is met, but the islands form ${evaluation.groups} separate groups — join them into one.`,
    };
  }
  const over = evaluation.over.filter(Boolean).length;
  if (over > 0) {
    return { tone: "bad", text: `${plural(over, "island")} ${over === 1 ? "has" : "have"} too many bridges.` };
  }
  if (evaluation.done === 0 && evaluation.loads.every((n) => n === 0)) {
    return { tone: "info", text: "Drag from island to island to build bridges." };
  }
  const left = total - evaluation.done;
  return { tone: "info", text: `${plural(left, "island")} still ${left === 1 ? "needs" : "need"} bridges.` };
}

function where(puzzle: Puzzle, island: number): string {
  const isl = puzzle.islands[island];
  return `the ${isl.need} at row ${isl.r + 1}, column ${isl.c + 1}`;
}

/** Why a hint's bridge is forced, in a sentence. */
export function hintText(puzzle: Puzzle, hint: Hint): string {
  if (hint.kind === "remove") {
    return hint.count === 0
      ? "Hint: that bridge was wrong, so it has been removed."
      : "Hint: that pair holds one bridge too many — the extra one has been removed.";
  }
  const what = hint.count === 2 ? "This double bridge" : "This bridge";
  switch (hint.reason) {
    case "capacity":
      return hint.island >= 0
        ? `Hint: ${what.toLowerCase()} is forced — ${where(puzzle, hint.island)} cannot reach its number any other way.`
        : `Hint: ${what.toLowerCase()} is forced by the numbers around it.`;
    case "cut":
      return `Hint: ${what.toLowerCase()} is the only route left that keeps every island reachable.`;
    case "isolation":
      return `Hint: ${what.toLowerCase()} is forced — any other choice would seal a group off from the rest.`;
    case "lookahead":
      return `Hint: ${what.toLowerCase()} is forced — every alternative here runs into a contradiction.`;
    default:
      return `Hint: ${what.toLowerCase()} belongs to the solution.`;
  }
}

/** The short-lived notice that accompanies a flash on the board. */
export function flashNotice(puzzle: Puzzle, flash: Flash): StatusLine {
  switch (flash.kind) {
    case "reject":
      return { tone: "bad", text: "Bridges can't cross — that line is blocked." };
    case "nolink":
      return { tone: "bad", text: "No island in that direction." };
    case "wrong":
      return { tone: "warn", text: hintText(puzzle, flash.hint) };
    case "hint":
      return { tone: "good", text: hintText(puzzle, flash.hint) };
  }
}
