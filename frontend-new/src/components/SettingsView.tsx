/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useEffect, useState } from "react";
import {
  Bot,
  CheckCircle2,
  ChevronRight,
  Gauge,
  Monitor,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
} from "lucide-react";
import { describeApiError, type AILearningStatus } from "../api";
import { getProfessionalModelStatus } from "../services/professionalModelApi";

const storageKey = "learnmate:ui-preferences:v2";

interface Preferences {
  density: "compact" | "comfortable" | "spacious";
  motion: "enhanced" | "standard" | "reduced";
  explanation: "图示优先" | "例题优先" | "推导优先";
  difficulty: "基础" | "自适应" | "挑战";
}

const defaults: Preferences = {
  density: "comfortable",
  motion: "standard",
  explanation: "图示优先",
  difficulty: "自适应",
};

export default function SettingsView({ onNavigateToTab }: { onNavigateToTab: (tab: string) => void }) {
  const [preferences, setPreferences] = useState<Preferences>(() => {
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem(storageKey) || "{}") };
    } catch {
      return defaults;
    }
  });
  const [status, setStatus] = useState<AILearningStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [probing, setProbing] = useState(false);

  const loadStatus = () => {
    setProbing(true);
    setStatusError("");
    getProfessionalModelStatus()
      .then(setStatus)
      .catch((reason) => setStatusError(describeApiError(reason, "模型服务暂时不可达")))
      .finally(() => setProbing(false));
  };

  useEffect(loadStatus, []);

  const update = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
    document.documentElement.dataset.motion = next.motion;
    document.documentElement.dataset.density = next.density;
  };

  return (
    <div className="lm-settings-page">
      <section className="lm-settings-hero">
        <div>
          <span className="lm-section-kicker">
            <Settings2 aria-hidden="true" /> 学习空间设置
          </span>
          <h2>让界面与模型更适合你的学习方式</h2>
          <p>模型凭据只保留在服务端，浏览器仅使用统一代理接口。</p>
        </div>
        <div className="lm-settings-glyph" aria-hidden="true">
          Aa<span>学</span>
        </div>
      </section>

      <section className="lm-settings-panel lm-settings-model">
        <header>
          <div>
            <Bot aria-hidden="true" />
            <span>
              <strong>专业模型接口</strong>
              <small>PROFESSIONAL MODEL GATEWAY</small>
            </span>
          </div>
          <button type="button" className="lm-button" onClick={loadStatus} disabled={probing}>
            <RefreshCw className={probing ? "is-spinning" : ""} aria-hidden="true" />
            重新检测
          </button>
        </header>
        <div className="lm-settings-model__grid">
          <div className="lm-model-status">
            <span className={status?.ai.ready ? "is-ready" : ""} />
            <small>连接状态</small>
            <strong>{status?.ai.ready ? "专业模型已就绪" : probing ? "正在检测" : "等待服务接入"}</strong>
            <p>
              {status?.ai.ready
                ? `${status.ai.provider} · ${status.ai.model}`
                : statusError || "通过后端代理接入 OpenAI-compatible 专业模型。"}
            </p>
          </div>
          <ModelSlot label="学习规划模型" value={status?.models?.planner || "由服务端配置"} />
          <ModelSlot label="辅导讲解模型" value={status?.models?.tutor || "由服务端配置"} />
          <ModelSlot label="检测生成模型" value={status?.models?.quiz || "由服务端配置"} />
          <ModelSlot label="多模态识别模型" value={status?.models?.vision || "由服务端配置"} />
        </div>
        <footer>
          <CheckCircle2 aria-hidden="true" />
          前端不会保存 API Key；路由、审计、引用核验与协同编排均由后端完成。
        </footer>
      </section>

      <section className="lm-settings-panel">
        <header>
          <div>
            <SlidersHorizontal aria-hidden="true" />
            <span>
              <strong>学习偏好</strong>
              <small>PERSONALIZATION</small>
            </span>
          </div>
        </header>
        <SettingRow label="讲解方式" description="影响助手回答、个性化讲义和思维导图的组织方式">
          <Segmented
            value={preferences.explanation}
            values={["图示优先", "例题优先", "推导优先"]}
            onChange={(value) => update("explanation", value as Preferences["explanation"])}
          />
        </SettingRow>
        <SettingRow label="学习难度" description="会与测验表现、错因和当前阶段共同参与生成">
          <Segmented
            value={preferences.difficulty}
            values={["基础", "自适应", "挑战"]}
            onChange={(value) => update("difficulty", value as Preferences["difficulty"])}
          />
        </SettingRow>
        <button type="button" className="lm-settings-link" onClick={() => onNavigateToTab("analytics")}>
          编辑七维学习画像 <ChevronRight aria-hidden="true" />
        </button>
      </section>

      <section className="lm-settings-panel">
        <header>
          <div>
            <Monitor aria-hidden="true" />
            <span>
              <strong>显示与动态</strong>
              <small>DISPLAY & MOTION</small>
            </span>
          </div>
        </header>
        <SettingRow label="信息密度" description="调整卡片留白与列表节奏，不改变学习内容">
          <Segmented
            value={preferences.density}
            values={["compact", "comfortable", "spacious"]}
            labels={["紧凑", "舒适", "宽松"]}
            onChange={(value) => update("density", value as Preferences["density"])}
          />
        </SettingRow>
        <SettingRow label="界面动效" description="包括浮动、收缩展开、书卷开场与页面进入动画">
          <Segmented
            value={preferences.motion}
            values={["enhanced", "standard", "reduced"]}
            labels={["增强", "标准", "减弱"]}
            onChange={(value) => update("motion", value as Preferences["motion"])}
          />
        </SettingRow>
      </section>

      <div className="lm-settings-footnote">
        <Gauge aria-hidden="true" />
        设置仅影响前端体验；学习证据、路径版本与资源记录仍由后端持久化。
      </div>
    </div>
  );
}

function ModelSlot({ label, value }: { label: string; value: string }) {
  return (
    <div className="lm-model-slot">
      <small>{label}</small>
      <strong>{value}</strong>
      <span>SERVER ROUTED</span>
    </div>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="lm-setting-row">
      <div>
        <strong>{label}</strong>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}

function Segmented({
  value,
  values,
  labels,
  onChange,
}: {
  value: string;
  values: string[];
  labels?: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="lm-segmented">
      {values.map((item, index) => (
        <button
          key={item}
          type="button"
          className={value === item ? "is-active" : ""}
          onClick={() => onChange(item)}
        >
          {labels?.[index] || item}
        </button>
      ))}
    </div>
  );
}
