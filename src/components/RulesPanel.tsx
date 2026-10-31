"use client";

import { useEffect } from "react";

interface RulesPanelProps {
  onClose: () => void;
}

export function RulesPanel({ onClose }: RulesPanelProps) {
  // Escape closes the dialog, like the button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="hs-overlay" role="dialog" aria-modal aria-label="How to play">
      <div className="hs-dialog">
        <h2 className="hs-dialog-title">How to play</h2>
        <div className="hs-rules">
          <p>
            Every circle is an <b>island</b>. Join them with <b>bridges</b> that run straight
            across or straight down, from one island to the next one it can see.
          </p>
          <p>
            A pair of islands holds <b>at most two</b> bridges. Bridges may <b>not cross</b> each
            other and never pass over an island.
          </p>
          <p>
            Each island must end with <b>exactly its number</b> of bridges, and all islands must
            join into <b>one connected network</b>. Islands glow <b>green</b> when complete and
            turn <b>red</b> when they hold too many.
          </p>
          <p>
            <b>Drag</b> from one island towards another — or tap an island, then one of its
            highlighted neighbours — to add a bridge. Repeat for a double bridge; a third time
            removes them. <b>Tap a bridge</b> to cycle it. <b>Right-click</b> or{" "}
            <b>long-press</b> a bridge to remove it, or an island to clear all of its bridges.
          </p>
          <p>
            Keys: <b>arrows</b> move between islands, <b>Shift + arrow</b> builds that way,{" "}
            <b>Delete</b> clears the selected island, <b>H</b> asks for a hint,{" "}
            <b>Ctrl/⌘ + Z</b> undoes and <b>Ctrl/⌘ + Y</b> redoes.
          </p>
          <p>
            A <b>hint</b> adds one bridge that is forced by the position on the board — or, if a
            bridge you drew is wrong, removes that first.
          </p>
        </div>
        <button type="button" className="hs-primary" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}
