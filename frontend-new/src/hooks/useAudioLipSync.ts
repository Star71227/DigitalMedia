/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useCallback, useEffect, useRef, useState } from "react";

interface AudioLipSyncOptions {
  audioElement: HTMLAudioElement | null;
  active: boolean;
  fallback: boolean;
  reducedMotion: boolean;
}

type WebkitWindow = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };

export function useAudioLipSync({ audioElement, active, fallback, reducedMotion }: AudioLipSyncOptions) {
  const [mouthOpen, setMouthOpen] = useState(0);
  const [analyserAvailable, setAnalyserAvailable] = useState(false);
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const frameRef = useRef<number | null>(null);
  const smoothedRef = useRef(0);
  const visibleRef = useRef(typeof document === "undefined" || !document.hidden);

  const cancelFrame = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    smoothedRef.current = 0;
    setMouthOpen(0);
  }, []);

  useEffect(() => {
    if (!audioElement) {
      setAnalyserAvailable(false);
      return;
    }
    const AudioContextClass = window.AudioContext || (window as WebkitWindow).webkitAudioContext;
    if (!AudioContextClass) return;

    try {
      const context = new AudioContextClass();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      const source = context.createMediaElementSource(audioElement);
      source.connect(analyser);
      analyser.connect(context.destination);
      contextRef.current = context;
      analyserRef.current = analyser;
      setAnalyserAvailable(true);
    } catch {
      setAnalyserAvailable(false);
    }

    return () => {
      cancelFrame();
      analyserRef.current?.disconnect();
      analyserRef.current = null;
      setAnalyserAvailable(false);
      const context = contextRef.current;
      contextRef.current = null;
      if (context && context.state !== "closed") void context.close();
    };
  }, [audioElement, cancelFrame]);

  useEffect(() => {
    const onVisibilityChange = () => {
      visibleRef.current = !document.hidden;
      if (document.hidden) cancelFrame();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [cancelFrame]);

  useEffect(() => {
    cancelFrame();
    if (!active || !visibleRef.current || reducedMotion) {
      if (active && reducedMotion) setMouthOpen(0.28);
      return;
    }

    const analyser = analyserRef.current;
    const samples = analyser ? new Uint8Array(analyser.fftSize) : null;
    const startedAt = performance.now();
    const tick = (now: number) => {
      let target = 0;
      if (analyser && samples) {
        analyser.getByteTimeDomainData(samples);
        let energy = 0;
        for (const sample of samples) {
          const normalized = (sample - 128) / 128;
          energy += normalized * normalized;
        }
        const rms = Math.sqrt(energy / samples.length);
        target = Math.min(1, Math.max(0.08, (rms - 0.012) * 8));
      } else if (fallback) {
        const elapsed = (now - startedAt) / 1000;
        target = 0.18 + Math.abs(Math.sin(elapsed * 8.4)) * 0.55 + Math.sin(elapsed * 3.1) * 0.08;
      }
      smoothedRef.current += (target - smoothedRef.current) * 0.34;
      setMouthOpen(Math.min(1, Math.max(0, smoothedRef.current)));
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return cancelFrame;
  }, [active, analyserAvailable, cancelFrame, fallback, reducedMotion]);

  const resumeContext = useCallback(async () => {
    const context = contextRef.current;
    if (context?.state === "suspended") await context.resume();
  }, []);

  return { mouthOpen, analyserAvailable, resumeContext };
}
