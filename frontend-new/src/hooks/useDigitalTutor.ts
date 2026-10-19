/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createBrowserTtsProvider, isSpeechSynthesisAvailable } from "../services/ttsService";
import type { DigitalTutorState, DigitalTutorVoiceMode, TtsProvider } from "../types/digitalTutor";

const STORAGE_KEY = "learnmate.digitalTutor.disabled";

interface DigitalTutorOptions {
  text: string;
  state: DigitalTutorState;
  audioUrl?: string;
  autoPlay: boolean;
  muted: boolean;
  disabled: boolean;
  onStateChange?: (state: DigitalTutorState) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

export function useDigitalTutor(options: DigitalTutorOptions) {
  const { text, audioUrl, autoPlay, muted, disabled, onStateChange, onComplete, onError } = options;
  const storedDisabled = useMemo(
    () => typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY) === "true",
    [],
  );
  const [state, setState] = useState<DigitalTutorState>(
    disabled || storedDisabled ? "disabled" : options.state,
  );
  const [closed, setClosed] = useState(disabled || storedDisabled);
  const [textOnly, setTextOnly] = useState(!audioUrl && !isSpeechSynthesisAvailable());
  const [rate, setRate] = useState(1);
  const [errorMessage, setErrorMessage] = useState("");
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const providerRef = useRef<TtsProvider>(createBrowserTtsProvider());
  const playIdRef = useRef(0);
  const autoPlayedRef = useRef(false);

  const transition = useCallback(
    (next: DigitalTutorState) => {
      setState(next);
      onStateChange?.(next);
    },
    [onStateChange],
  );

  const reportError = useCallback(
    (reason: unknown) => {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      setErrorMessage(error.message);
      transition("error");
      onError?.(error);
    },
    [onError, transition],
  );

  const stop = useCallback(
    (nextState: DigitalTutorState = "idle") => {
      playIdRef.current += 1;
      providerRef.current.stop();
      if (audioElement) {
        audioElement.pause();
        audioElement.currentTime = 0;
      }
      if (!closed && !disabled) transition(nextState);
    },
    [audioElement, closed, disabled, transition],
  );

  const play = useCallback(async () => {
    if (closed || disabled || !text.trim()) return;
    const playId = ++playIdRef.current;
    setErrorMessage("");
    transition("speaking");
    try {
      if (textOnly) return;
      if (audioUrl && audioElement) {
        audioElement.playbackRate = rate;
        audioElement.muted = muted;
        audioElement.currentTime = 0;
        await audioElement.play();
        return;
      }
      if (!providerRef.current.isAvailable()) {
        setTextOnly(true);
        transition("speaking");
        return;
      }
      const result = await providerRef.current.speak({ text, rate, pitch: 1, volume: muted ? 0 : 1 });
      if (playId === playIdRef.current && result.completed) {
        transition("idle");
        onComplete?.();
      }
    } catch (reason) {
      if (playId !== playIdRef.current) return;
      if (!audioUrl) {
        setTextOnly(true);
        setErrorMessage("");
        transition("speaking");
        return;
      }
      reportError(reason);
    }
  }, [
    audioElement,
    audioUrl,
    closed,
    disabled,
    muted,
    onComplete,
    rate,
    reportError,
    text,
    textOnly,
    transition,
  ]);

  const pause = useCallback(() => {
    if (state !== "speaking") return;
    if (audioUrl) audioElement?.pause();
    else providerRef.current.pause();
    transition("paused");
  }, [audioElement, audioUrl, state, transition]);

  const resume = useCallback(async () => {
    if (state !== "paused" || closed || disabled) return;
    transition("speaking");
    try {
      if (audioUrl && audioElement) await audioElement.play();
      else providerRef.current.resume();
    } catch (reason) {
      reportError(reason);
    }
  }, [audioElement, audioUrl, closed, disabled, reportError, state, transition]);

  const close = useCallback(() => {
    playIdRef.current += 1;
    providerRef.current.stop();
    audioElement?.pause();
    window.localStorage.setItem(STORAGE_KEY, "true");
    setClosed(true);
    transition("disabled");
  }, [audioElement, transition]);

  const enable = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    setClosed(false);
    transition("idle");
  }, [transition]);

  useEffect(() => {
    if (!closed && !disabled && !["speaking", "paused"].includes(state)) transition(options.state);
    // External display-state changes should not interrupt active playback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.state]);

  useEffect(() => {
    if (disabled) {
      providerRef.current.stop();
      audioElement?.pause();
      setClosed(true);
      transition("disabled");
    }
  }, [audioElement, disabled, transition]);

  useEffect(() => {
    providerRef.current.setMuted(muted);
    if (audioElement) audioElement.muted = muted;
  }, [audioElement, muted]);

  useEffect(() => {
    setErrorMessage("");
  }, [audioUrl]);

  useEffect(() => {
    if (!autoPlay || autoPlayedRef.current || closed || disabled) return;
    autoPlayedRef.current = true;
    void play();
  }, [autoPlay, closed, disabled, play]);

  useEffect(() => {
    if (!audioElement) return;
    const ended = () => {
      if (state === "speaking") {
        transition("idle");
        onComplete?.();
      }
    };
    const failed = () => reportError(new Error("讲解音频加载或播放失败。"));
    audioElement.addEventListener("ended", ended);
    audioElement.addEventListener("error", failed);
    return () => {
      audioElement.removeEventListener("ended", ended);
      audioElement.removeEventListener("error", failed);
    };
  }, [audioElement, onComplete, reportError, state, transition]);

  useEffect(
    () => () => {
      playIdRef.current += 1;
      providerRef.current.stop();
      if (audioElement) {
        audioElement.pause();
        audioElement.removeAttribute("src");
        audioElement.load();
      }
    },
    [audioElement],
  );

  return {
    state,
    closed,
    textOnly,
    rate,
    errorMessage,
    audioElement,
    voiceMode: (textOnly ? "text" : audioUrl ? "audio" : "browser") as DigitalTutorVoiceMode,
    setAudioElement,
    setTextOnly,
    setRate,
    play,
    pause,
    resume,
    stop,
    close,
    enable,
  };
}
