"use client";

interface ControlsProps {
  canUndo: boolean;
  canRedo: boolean;
  canRestart: boolean;
  disabled: boolean;
  onHint: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onRestart: () => void;
}

export function Controls({
  canUndo,
  canRedo,
  canRestart,
  disabled,
  onHint,
  onUndo,
  onRedo,
  onRestart,
}: ControlsProps) {
  return (
    <div className="hs-actions">
      <button type="button" className="hs-btn" onClick={onHint} disabled={disabled}>
        <span className="hs-btn-glyph" aria-hidden>
          {"✦"}
        </span>
        Hint
      </button>
      <button type="button" className="hs-btn" onClick={onUndo} disabled={disabled || !canUndo}>
        <span className="hs-btn-glyph" aria-hidden>
          {"↶"}
        </span>
        Undo
      </button>
      <button type="button" className="hs-btn" onClick={onRedo} disabled={disabled || !canRedo}>
        <span className="hs-btn-glyph" aria-hidden>
          {"↷"}
        </span>
        Redo
      </button>
      <button type="button" className="hs-btn" onClick={onRestart} disabled={disabled || !canRestart}>
        <span className="hs-btn-glyph" aria-hidden>
          {"⟲"}
        </span>
        Restart
      </button>
    </div>
  );
}
