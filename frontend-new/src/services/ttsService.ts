/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import type { TtsInput, TtsProvider, TtsResult } from "../types/digitalTutor";

const isSpeechSynthesisAvailable = () =>
  typeof window !== "undefined" &&
  "speechSynthesis" in window &&
  typeof window.SpeechSynthesisUtterance !== "undefined";

export class BrowserSpeechSynthesisProvider implements TtsProvider {
  private utterance: SpeechSynthesisUtterance | null = null;
  private stopped = false;

  isAvailable() {
    return isSpeechSynthesisAvailable();
  }

  speak(input: TtsInput): Promise<TtsResult> {
    if (!this.isAvailable()) {
      return Promise.reject(new Error("当前浏览器不支持语音朗读，已切换为纯文字模式。"));
    }

    this.stop();
    this.stopped = false;
    const utterance = new SpeechSynthesisUtterance(input.text);
    const voices = window.speechSynthesis.getVoices();
    utterance.voice =
      voices.find((voice) => voice.name === input.voice) ??
      voices.find((voice) => /^zh(?:-|_)/i.test(voice.lang)) ??
      null;
    utterance.lang = utterance.voice?.lang || "zh-CN";
    utterance.rate = Math.min(2, Math.max(0.5, input.rate ?? 1));
    utterance.pitch = Math.min(2, Math.max(0, input.pitch ?? 1));
    utterance.volume = Math.min(1, Math.max(0, input.volume ?? 1));
    this.utterance = utterance;

    return new Promise<TtsResult>((resolve, reject) => {
      utterance.onend = () => {
        if (this.utterance === utterance) this.utterance = null;
        resolve({ mode: "browser", completed: !this.stopped });
      };
      utterance.onerror = (event) => {
        if (this.utterance === utterance) this.utterance = null;
        if (this.stopped || event.error === "canceled" || event.error === "interrupted") {
          resolve({ mode: "browser", completed: false });
          return;
        }
        reject(new Error(`浏览器语音播放失败：${event.error || "未知错误"}`));
      };
      window.speechSynthesis.speak(utterance);
    });
  }

  pause() {
    if (this.isAvailable() && window.speechSynthesis.speaking) window.speechSynthesis.pause();
  }

  resume() {
    if (this.isAvailable() && window.speechSynthesis.paused) window.speechSynthesis.resume();
  }

  stop() {
    if (!this.isAvailable()) return;
    this.stopped = true;
    window.speechSynthesis.cancel();
    this.utterance = null;
  }

  setMuted(muted: boolean) {
    if (this.utterance) this.utterance.volume = muted ? 0 : 1;
  }
}

export const createBrowserTtsProvider = (): TtsProvider => new BrowserSpeechSynthesisProvider();
export { isSpeechSynthesisAvailable };
