/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  CheckCircle2,
  Clock3,
  Coffee,
  Headphones,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Timer,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

interface FocusTimerProps {
  onFocusComplete?: (minutes: number) => void;
}

type NoiseType = "none" | "brown" | "white";

const BREAK_SECONDS = 5 * 60;
const PRESETS = [25, 50, 90, 120, 180];
const DURATION_MIN = 25;
const DURATION_MAX = 600; // 与后端 recordFocusSession 的 1-600 分钟上限一致
const NOISE_OPTIONS: Array<{ id: NoiseType; label: string; detail: string }> = [
  { id: "none", label: "无背景音", detail: "保持当前环境" },
  { id: "brown", label: "低频噪音", detail: "适合阅读推导" },
  { id: "white", label: "白噪音", detail: "适合屏蔽杂音" },
];

const GUIDANCE = {
  idle: "选择一段可完成的时间，准备好当前任务后再开始。",
  focus: "保持当前学习页，遇到卡点先记录关键词，结束后再复盘。",
  break: "离开屏幕活动一下，看看远处，休息结束后再回到下一轮。",
};

type AudioWindow = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };

export default function FocusTimer({ onFocusComplete }: FocusTimerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [duration, setDuration] = useState(25);
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [isBreak, setIsBreak] = useState(false);
  const [noiseType, setNoiseType] = useState<NoiseType>("none");
  const [chimeEnabled, setChimeEnabled] = useState(true);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [completedMinutes, setCompletedMinutes] = useState(0);
  const [audioNotice, setAudioNotice] = useState("");
  const [breakNotice, setBreakNotice] = useState("");

  const audioCtxRef = useRef<AudioContext | null>(null);
  const noiseSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const breakButtonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const posRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null);
  const [panelPos, setPanelPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const applyTransform = useCallback((x: number, y: number) => {
    posRef.current = { x, y };
    if (panelRef.current) panelRef.current.style.transform = `translate(${x}px, ${y}px)`;
  }, []);

  useEffect(() => {
    applyTransform(panelPos.x, panelPos.y);
  }, [applyTransform, panelPos]);

  // 窗口尺寸变化时把面板重新夹回可视区内，避免拖到外面后收不回来
  useEffect(() => {
    const reClamp = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const rect = panel.getBoundingClientRect();
      const margin = 8;
      const naturalLeft = rect.left - posRef.current.x;
      const naturalTop = rect.top - posRef.current.y;
      const minX = margin - naturalLeft;
      const minY = margin - naturalTop;
      const maxX = window.innerWidth - margin - rect.width - naturalLeft;
      const maxY = window.innerHeight - margin - rect.height - naturalTop;
      const nextX = Math.min(Math.max(posRef.current.x, Math.min(minX, maxX)), maxX);
      const nextY = Math.min(Math.max(posRef.current.y, Math.min(minY, maxY)), maxY);
      applyTransform(nextX, nextY);
    };
    window.addEventListener("resize", reClamp);
    return () => window.removeEventListener("resize", reClamp);
  }, [applyTransform]);

  const clampDragPosition = (x: number, y: number) => {
    const panel = panelRef.current;
    if (!panel) return { x, y };
    const rect = panel.getBoundingClientRect();
    const margin = 8;
    const naturalLeft = rect.left - posRef.current.x;
    const naturalTop = rect.top - posRef.current.y;
    const minX = margin - naturalLeft;
    const minY = margin - naturalTop;
    const maxX = window.innerWidth - margin - rect.width - naturalLeft;
    const maxY = window.innerHeight - margin - rect.height - naturalTop;
    return {
      x: Math.min(Math.max(x, Math.min(minX, maxX)), maxX),
      y: Math.min(Math.max(y, Math.min(minY, maxY)), maxY),
    };
  };

  const handleHeaderPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;
    dragRef.current = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleHeaderPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    const next = clampDragPosition(posRef.current.x + dx, posRef.current.y + dy);
    applyTransform(next.x, next.y);
  };

  const finishDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    setPanelPos({ ...posRef.current });
  };

  const initAudioContext = useCallback(() => {
    if (audioCtxRef.current) return audioCtxRef.current;
    const AudioContextClass = window.AudioContext || (window as AudioWindow).webkitAudioContext;
    if (!AudioContextClass) {
      setAudioNotice("当前浏览器不支持背景音，计时功能仍可正常使用。");
      return null;
    }
    audioCtxRef.current = new AudioContextClass();
    return audioCtxRef.current;
  }, []);

  const resumeAudio = useCallback(() => {
    const ctx = initAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {
        setAudioNotice("浏览器暂时阻止声音播放，请再次点击开始或关闭背景音。");
      });
    }
  }, [initAudioContext]);

  const stopNoiseSynthesis = useCallback(() => {
    if (!noiseSourceRef.current) return;
    try {
      noiseSourceRef.current.stop();
    } catch {
      // The source may already be stopped by the browser audio engine.
    }
    noiseSourceRef.current = null;
  }, []);

  const playChimeSound = useCallback(() => {
    if (!chimeEnabled) return;
    try {
      const ctx = initAudioContext();
      if (!ctx) return;
      if (ctx.state === "suspended") void ctx.resume();

      const playTone = (freq: number, start: number, durationTime: number) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, start);
        gainNode.gain.setValueAtTime(0.16, start);
        gainNode.gain.exponentialRampToValueAtTime(0.001, start + durationTime);
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + durationTime);
      };

      const now = ctx.currentTime;
      playTone(523.25, now, 0.45);
      playTone(659.25, now + 0.12, 0.45);
      playTone(783.99, now + 0.24, 0.6);
    } catch {
      setAudioNotice("提示音没有成功播放，计时记录已保存。");
    }
  }, [chimeEnabled, initAudioContext]);

  const startNoiseSynthesis = useCallback(
    (type: Exclude<NoiseType, "none">) => {
      try {
        const ctx = initAudioContext();
        if (!ctx) return;
        if (ctx.state === "suspended") void ctx.resume();

        stopNoiseSynthesis();

        const bufferSize = 2 * ctx.sampleRate;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);

        if (type === "white") {
          for (let index = 0; index < bufferSize; index += 1) {
            data[index] = Math.random() * 2 - 1;
          }
        } else {
          let lastOut = 0;
          for (let index = 0; index < bufferSize; index += 1) {
            const white = Math.random() * 2 - 1;
            data[index] = (lastOut + 0.02 * white) / 1.02;
            lastOut = data[index];
            data[index] *= 3.2;
          }
        }

        const source = ctx.createBufferSource();
        const lowpass = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        source.buffer = buffer;
        source.loop = true;
        lowpass.type = "lowpass";
        lowpass.frequency.setValueAtTime(type === "brown" ? 350 : 600, ctx.currentTime);
        gain.gain.setValueAtTime(type === "brown" ? 0.07 : 0.04, ctx.currentTime);

        source.connect(lowpass);
        lowpass.connect(gain);
        gain.connect(ctx.destination);
        source.start();
        noiseSourceRef.current = source;
      } catch {
        setAudioNotice("背景音没有成功开启，计时功能仍可正常使用。");
      }
    },
    [initAudioContext, stopNoiseSynthesis],
  );

  const handleTimerComplete = useCallback(() => {
    setIsRunning(false);
    stopNoiseSynthesis();
    playChimeSound();

    if (isBreak) {
      setIsBreak(false);
      setTimeLeft(duration * 60);
      setBreakNotice("休息已结束，可以开始下一轮专注。");
      return;
    }

    setCompletedMinutes(duration);
    setShowCompletionModal(true);
    onFocusComplete?.(duration);
  }, [duration, isBreak, onFocusComplete, playChimeSound, stopNoiseSynthesis]);

  useEffect(() => {
    if (!isRunning && !isBreak) setTimeLeft(duration * 60);
  }, [duration, isBreak, isRunning]);

  useEffect(() => {
    if (!isRunning) return;
    const intervalId = window.setInterval(() => {
      setTimeLeft((current) => {
        if (current <= 1) {
          window.clearInterval(intervalId);
          handleTimerComplete();
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [handleTimerComplete, isRunning]);

  useEffect(() => {
    if (isRunning && noiseType !== "none" && !isBreak) {
      startNoiseSynthesis(noiseType);
    } else {
      stopNoiseSynthesis();
    }
    return () => stopNoiseSynthesis();
  }, [isBreak, isRunning, noiseType, startNoiseSynthesis, stopNoiseSynthesis]);

  useEffect(() => {
    if (!showCompletionModal) return;
    breakButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowCompletionModal(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showCompletionModal]);

  const handleStartPause = () => {
    setAudioNotice("");
    setBreakNotice("");
    resumeAudio();
    setIsRunning((current) => !current);
  };

  const handleReset = () => {
    setIsRunning(false);
    stopNoiseSynthesis();
    setTimeLeft(isBreak ? BREAK_SECONDS : duration * 60);
  };

  const handleSkipBreak = () => {
    setIsRunning(false);
    setIsBreak(false);
    setTimeLeft(duration * 60);
    setBreakNotice("已跳过休息，下一轮专注已准备好。");
    stopNoiseSynthesis();
  };

  const handleStartBreak = () => {
    setShowCompletionModal(false);
    setIsBreak(true);
    setTimeLeft(BREAK_SECONDS);
    setBreakNotice("");
    setIsRunning(true);
  };

  const handleSetPreset = (minutes: number) => {
    if (isRunning || isBreak) return;
    setDuration(minutes);
    setTimeLeft(minutes * 60);
  };

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const totalSeconds = isBreak ? BREAK_SECONDS : duration * 60;
  const progressPercent = totalSeconds ? Math.round(((totalSeconds - timeLeft) / totalSeconds) * 100) : 0;
  const radius = 54;
  const strokeWidth = 5;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (timeLeft / totalSeconds) * circumference;
  const guidance = isBreak ? GUIDANCE.break : isRunning ? GUIDANCE.focus : GUIDANCE.idle;
  const currentModeLabel = isBreak ? "休息" : isRunning ? "专注中" : "准备";

  return (
    <>
      <div className="lm-focus-root" aria-live="polite">
        {isRunning && (
          <div className={`lm-focus-running-status ${isBreak ? "is-break" : ""}`}>
            <span aria-hidden="true" />
            <strong>{isBreak ? "休息" : "专注"}</strong>
            <span>{formatTime(timeLeft)}</span>
          </div>
        )}

        <button
          type="button"
          className={`lm-focus-launcher ${isRunning ? "is-running" : ""} ${isBreak ? "is-break" : ""}`}
          onClick={() => {
            setIsOpen((value) => !value);
            setIsMinimized(false);
          }}
          aria-label={isOpen ? "关闭专注计时器" : "打开专注计时器"}
          aria-expanded={isOpen}
        >
          {isOpen ? <X aria-hidden="true" /> : <Timer aria-hidden="true" />}
        </button>
      </div>

      {isOpen && !isMinimized && (
        <section
          ref={panelRef}
          className={`lm-focus-panel${dragging ? " is-dragging" : ""}`}
          aria-labelledby="lm-focus-title"
        >
          <header
            className="lm-focus-header"
            onPointerDown={handleHeaderPointerDown}
            onPointerMove={handleHeaderPointerMove}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
          >
            <div className="lm-focus-title-row">
              <span className={`lm-focus-icon ${isBreak ? "is-break" : ""}`} aria-hidden="true">
                {isBreak ? <Coffee /> : <Clock3 />}
              </span>
              <div>
                <h2 id="lm-focus-title">专注计时器</h2>
                <p>
                  {currentModeLabel} · {duration} 分钟学习段
                </p>
              </div>
            </div>
            <div className="lm-focus-window-actions">
              <button
                type="button"
                className="lm-icon-button"
                onClick={() => setIsMinimized(true)}
                aria-label="最小化专注计时器"
              >
                <Minimize2 aria-hidden="true" />
              </button>
              <button
                type="button"
                className="lm-icon-button"
                onClick={() => setIsOpen(false)}
                aria-label="关闭专注计时器"
              >
                <X aria-hidden="true" />
              </button>
            </div>
          </header>

          <div className="lm-focus-clock" aria-label={`剩余时间 ${formatTime(timeLeft)}`}>
            <svg viewBox="0 0 144 144" aria-hidden="true" focusable="false">
              <circle
                cx="72"
                cy="72"
                r={radius}
                className="lm-focus-clock__track"
                strokeWidth={strokeWidth}
              />
              <circle
                cx="72"
                cy="72"
                r={radius}
                className={`lm-focus-clock__progress ${isBreak ? "is-break" : ""}`}
                strokeWidth={strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
              />
            </svg>
            <div>
              <strong>{formatTime(timeLeft)}</strong>
              <span>{progressPercent}%</span>
            </div>
          </div>

          <div className="lm-focus-guidance">
            <CheckCircle2 aria-hidden="true" />
            <p>{guidance}</p>
          </div>

          {!isRunning && !isBreak && (
            <div className="lm-focus-duration">
              <div className="lm-focus-setting-head">
                <label htmlFor="lm-focus-duration">学习时长</label>
                <strong>{duration} 分钟</strong>
              </div>
              <input
                id="lm-focus-duration"
                type="range"
                min={DURATION_MIN}
                max={DURATION_MAX}
                step="5"
                value={duration}
                onChange={(event) => setDuration(Number(event.target.value))}
              />
              <div className="lm-focus-presets" aria-label="常用学习时长">
                {PRESETS.map((minutes) => (
                  <button
                    type="button"
                    key={minutes}
                    className={`lm-focus-preset ${duration === minutes ? "is-active" : ""}`}
                    onClick={() => handleSetPreset(minutes)}
                  >
                    {minutes} 分钟
                  </button>
                ))}
              </div>
            </div>
          )}

          {!isBreak && (
            <div className="lm-focus-sound">
              <div className="lm-focus-setting-head">
                <span>
                  <Headphones aria-hidden="true" />
                  背景音
                </span>
                <button
                  type="button"
                  className="lm-focus-inline-button"
                  onClick={() => setChimeEnabled((value) => !value)}
                  aria-pressed={chimeEnabled}
                >
                  {chimeEnabled ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
                  {chimeEnabled ? "结束提示音开" : "结束提示音关"}
                </button>
              </div>
              <div className="lm-focus-noise-options">
                {NOISE_OPTIONS.map((noise) => (
                  <button
                    type="button"
                    key={noise.id}
                    className={`lm-focus-noise ${noiseType === noise.id ? "is-active" : ""}`}
                    onClick={() => setNoiseType(noise.id)}
                    aria-pressed={noiseType === noise.id}
                  >
                    <strong>{noise.label}</strong>
                    <span>{noise.detail}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {(audioNotice || breakNotice) && (
            <p className="lm-focus-notice" role="status">
              {audioNotice || breakNotice}
            </p>
          )}

          <div className="lm-focus-controls">
            {isBreak ? (
              <>
                <button type="button" className="lm-button lm-button--primary" onClick={handleStartPause}>
                  {isRunning ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
                  {isRunning ? "暂停休息" : "继续休息"}
                </button>
                <button type="button" className="lm-button" onClick={handleSkipBreak}>
                  跳过休息
                </button>
              </>
            ) : (
              <>
                <button type="button" className="lm-button lm-button--primary" onClick={handleStartPause}>
                  {isRunning ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
                  {isRunning ? "暂停" : "开始专注"}
                </button>
                {(isRunning || timeLeft !== duration * 60) && (
                  <button
                    type="button"
                    className="lm-icon-button"
                    onClick={handleReset}
                    aria-label="重置计时"
                  >
                    <RotateCcw aria-hidden="true" />
                  </button>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {isOpen && isMinimized && (
        <button
          type="button"
          className="lm-focus-mini"
          onClick={() => setIsMinimized(false)}
          aria-label="展开专注计时器"
        >
          <span className={`lm-focus-mini__icon ${isBreak ? "is-break" : ""}`} aria-hidden="true">
            {isBreak ? <Coffee /> : <Timer />}
          </span>
          <span>
            <strong>{isBreak ? "休息中" : isRunning ? "专注中" : "专注计时器"}</strong>
            <small>{formatTime(timeLeft)}</small>
          </span>
          <Maximize2 aria-hidden="true" />
        </button>
      )}

      {showCompletionModal && (
        <div className="lm-focus-dialog-backdrop">
          <section
            className="lm-focus-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lm-focus-complete-title"
          >
            <div className="lm-focus-dialog__icon" aria-hidden="true">
              <CheckCircle2 />
            </div>
            <h2 id="lm-focus-complete-title">本轮专注已完成</h2>
            <p>已记录 {completedMinutes} 分钟学习时间。建议先休息 5 分钟，再继续下一项任务。</p>
            <ul>
              <li>起身活动肩颈和手腕。</li>
              <li>看向远处，让眼睛离开屏幕。</li>
              <li>回到座位后先复盘刚才的卡点。</li>
            </ul>
            <div className="lm-focus-dialog__actions">
              <button
                ref={breakButtonRef}
                type="button"
                className="lm-button lm-button--primary"
                onClick={handleStartBreak}
              >
                <Coffee aria-hidden="true" />
                开始 5 分钟休息
              </button>
              <button type="button" className="lm-button" onClick={() => setShowCompletionModal(false)}>
                稍后再休息
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
