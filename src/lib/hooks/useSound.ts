"use client";

import { useCallback, useRef } from "react";
import type { SoundEvent } from "@/lib/game/play";

/**
 * Procedural Web Audio effects — no asset files, so nothing to load or 404.
 * The context is created lazily on the first sound because browsers refuse to
 * start one before a user gesture.
 */
export function useSound(enabled: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);

  const context = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (!ctxRef.current) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctxRef.current = new Ctor();
    }
    if (ctxRef.current.state === "suspended") void ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const blip = useCallback(
    (
      ctx: AudioContext,
      freq: number,
      duration: number,
      type: OscillatorType,
      gain: number,
      slideTo?: number,
      delay = 0
    ) => {
      const start = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      if (slideTo !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), start + duration);
      }
      amp.gain.setValueAtTime(gain, start);
      amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(amp).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration);
      // Release the nodes as soon as they are silent so nothing accumulates
      // over a long session.
      osc.onended = () => {
        osc.disconnect();
        amp.disconnect();
      };
    },
    []
  );

  const play = useCallback(
    (voice: SoundEvent) => {
      if (!enabled) return;
      const ctx = context();
      if (!ctx) return;

      switch (voice) {
        case "select":
          // A soft tick, barely there, so moving the cursor stays quiet.
          blip(ctx, 540, 0.04, "sine", 0.03);
          break;
        case "bridge":
          // A wooden "plank down": a quick downward knock.
          blip(ctx, 392, 0.09, "triangle", 0.06, 300);
          break;
        case "double":
          // Two planks in quick succession, the second a step higher.
          blip(ctx, 392, 0.08, "triangle", 0.055, 300);
          blip(ctx, 494, 0.1, "triangle", 0.055, 380, 0.07);
          break;
        case "complete":
          // An island reached its number: a bright little two-note chime.
          blip(ctx, 659, 0.1, "sine", 0.05);
          blip(ctx, 988, 0.16, "sine", 0.045, undefined, 0.07);
          break;
        case "remove":
          blip(ctx, 360, 0.12, "triangle", 0.045, 170);
          break;
        case "clear":
          blip(ctx, 300, 0.22, "triangle", 0.05, 110);
          break;
        case "undo":
          blip(ctx, 470, 0.06, "sine", 0.04, 420);
          break;
        case "reject":
          // The buzz: a short, rough low saw.
          blip(ctx, 150, 0.2, "sawtooth", 0.045, 92);
          blip(ctx, 156, 0.2, "square", 0.018, 96);
          break;
        case "hint":
          [880, 1108, 1318].forEach((f, i) => blip(ctx, f, 0.12, "triangle", 0.04, undefined, i * 0.06));
          break;
        case "win":
          [523, 659, 784, 1046, 1318].forEach((f, i) =>
            blip(ctx, f, 0.24, "triangle", 0.055, undefined, i * 0.1)
          );
          break;
      }
    },
    [blip, context, enabled]
  );

  return play;
}
