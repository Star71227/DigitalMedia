/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useEffect, useState } from "react";
import { useAudioLipSync } from "../../hooks/useAudioLipSync";
import { useDigitalTutor } from "../../hooks/useDigitalTutor";
import type { DigitalTutorProps, DigitalTutorState, DigitalTutorVoiceMode } from "../../types/digitalTutor";
import DigitalTutorAvatar from "./DigitalTutorAvatar";
import "./digitalTutor.css";

const stateLabels: Record<DigitalTutorState, string> = {
  idle: "待机",
  listening: "正在聆听",
  thinking: "正在思考",
  speaking: "正在讲解",
  paused: "已暂停",
  encouraging: "学习鼓励",
  error: "发生错误",
  disabled: "已关闭",
};

const modeLabels: Record<DigitalTutorVoiceMode, string> = {
  browser: "浏览器语音模式",
  audio: "音频分析模式",
  text: "纯文字降级",
};

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

export default function DigitalTutor({
  name = "小智",
  text = "",
  title = "小智学习讲解",
  subtitle,
  state: requestedState = "idle",
  audioUrl,
  autoPlay = false,
  muted = false,
  compact = false,
  disabled = false,
  onStateChange,
  onComplete,
  onError,
}: DigitalTutorProps) {
  const [isMuted, setIsMuted] = useState(muted);
  const reducedMotion = useReducedMotion();
  const tutor = useDigitalTutor({
    text,
    state: requestedState,
    audioUrl,
    autoPlay,
    muted: isMuted,
    disabled,
    onStateChange,
    onComplete,
    onError,
  });
  const lipSync = useAudioLipSync({
    audioElement: tutor.audioElement,
    active: tutor.state === "speaking" && !tutor.textOnly,
    fallback: !audioUrl,
    reducedMotion,
  });

  useEffect(() => setIsMuted(muted), [muted]);

  if (tutor.closed) {
    return (
      <section
        className={`dt-panel dt-panel--closed${compact ? " dt-panel--compact" : ""}`}
        aria-label="数字讲师已关闭"
      >
        <div>
          <strong>数字讲师已关闭</strong>
          <p>偏好已保存在本机，不会保存讲稿内容。</p>
        </div>
        {!disabled && (
          <button
            type="button"
            className="dt-button dt-button--primary"
            onClick={tutor.enable}
            aria-label="重新开启数字讲师"
          >
            重新开启
          </button>
        )}
      </section>
    );
  }

  const beginPlayback = async () => {
    await lipSync.resumeContext();
    await tutor.play();
  };
  const resumePlayback = async () => {
    await lipSync.resumeContext();
    await tutor.resume();
  };
  const toggleTextOnly = () => {
    tutor.stop();
    tutor.setTextOnly(!tutor.textOnly);
  };

  return (
    <section
      className={`dt-panel${compact ? " dt-panel--compact" : ""}`}
      aria-labelledby="digital-tutor-title"
    >
      {audioUrl && <audio ref={tutor.setAudioElement} src={audioUrl} preload="metadata" />}
      <header className="dt-header">
        <div className="dt-identity">
          <span className="dt-logo" aria-hidden="true">
            LM
          </span>
          <div>
            <b>{name}</b>
            <small>智课研伴 数字讲师</small>
          </div>
        </div>
        <button
          type="button"
          className="dt-icon-button"
          onClick={tutor.close}
          aria-label="关闭数字讲师"
          title="关闭数字讲师"
        >
          ×
        </button>
      </header>

      <div className="dt-content">
        <div className="dt-stage">
          <DigitalTutorAvatar
            state={tutor.state}
            mouthOpen={lipSync.mouthOpen}
            name={name}
            compact={compact}
            reducedMotion={reducedMotion}
          />
          <div className="dt-badges" aria-live="polite">
            <span className={`dt-status dt-status--${tutor.state}`}>状态：{stateLabels[tutor.state]}</span>
            <span className="dt-mode">{modeLabels[tutor.voiceMode]}</span>
          </div>
        </div>

        <div className="dt-script">
          <div className="dt-script-heading">
            <div>
              <p className="dt-eyebrow">LEARNING BRIEF</p>
              <h2 id="digital-tutor-title">{title}</h2>
            </div>
            {subtitle && <span className="dt-subtitle">{subtitle}</span>}
          </div>
          <p className="dt-transcript">{text || "选择一段讲稿后，小智会在这里为你讲解。"}</p>
          {tutor.errorMessage && (
            <p className="dt-error" role="alert">
              {tutor.errorMessage}
            </p>
          )}

          <div className="dt-controls" aria-label="数字讲师播放控制">
            <button
              type="button"
              className="dt-button dt-button--primary"
              onClick={() => void beginPlayback()}
              disabled={tutor.state === "speaking"}
              aria-label="播放讲解"
            >
              ▶ 播放
            </button>
            <button
              type="button"
              className="dt-button"
              onClick={tutor.pause}
              disabled={tutor.state !== "speaking"}
              aria-label="暂停讲解"
            >
              Ⅱ 暂停
            </button>
            <button
              type="button"
              className="dt-button"
              onClick={() => void resumePlayback()}
              disabled={tutor.state !== "paused"}
              aria-label="继续讲解"
            >
              ↻ 继续
            </button>
            <button
              type="button"
              className="dt-button"
              onClick={() => tutor.stop()}
              disabled={!["speaking", "paused"].includes(tutor.state)}
              aria-label="停止讲解"
            >
              ■ 停止
            </button>
          </div>

          <div className="dt-settings">
            <button
              type="button"
              className="dt-toggle"
              aria-pressed={isMuted}
              onClick={() => setIsMuted((value) => !value)}
              aria-label={isMuted ? "取消静音" : "静音"}
            >
              <span aria-hidden="true">{isMuted ? "🔇" : "🔊"}</span>
              {isMuted ? "已静音" : "有声音"}
            </button>
            <button
              type="button"
              className="dt-toggle"
              aria-pressed={tutor.textOnly}
              onClick={toggleTextOnly}
              aria-label="切换纯文字模式"
            >
              <span aria-hidden="true">Aa</span>
              {tutor.textOnly ? "纯文字" : "语音模式"}
            </button>
            <label className="dt-rate">
              语速
              <select
                value={tutor.rate}
                onChange={(event) => tutor.setRate(Number(event.target.value))}
                aria-label="选择讲解语速"
              >
                <option value="0.75">0.75×</option>
                <option value="1">1.0×</option>
                <option value="1.25">1.25×</option>
                <option value="1.5">1.5×</option>
              </select>
            </label>
          </div>
          <p className="dt-privacy">仅保存“已关闭”偏好，不保存讲稿或学习敏感内容。</p>
        </div>
      </div>
    </section>
  );
}
