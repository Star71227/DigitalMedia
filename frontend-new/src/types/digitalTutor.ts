/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
export type DigitalTutorState =
  "idle" | "listening" | "thinking" | "speaking" | "paused" | "encouraging" | "error" | "disabled";

export type DigitalTutorVoiceMode = "browser" | "audio" | "text";

export interface TtsInput {
  text: string;
  voice?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
}

export interface TtsResult {
  mode: "browser";
  completed: boolean;
}

export interface TtsProvider {
  isAvailable(): boolean;
  speak(input: TtsInput): Promise<TtsResult>;
  pause(): void;
  resume(): void;
  stop(): void;
  setMuted(muted: boolean): void;
}

export interface DigitalTutorProps {
  name?: string;
  text?: string;
  title?: string;
  subtitle?: string;
  state?: DigitalTutorState;
  audioUrl?: string;
  autoPlay?: boolean;
  muted?: boolean;
  compact?: boolean;
  disabled?: boolean;
  onStateChange?: (state: DigitalTutorState) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}
