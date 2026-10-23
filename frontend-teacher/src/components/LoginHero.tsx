/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { Check } from "lucide-react";
import LogoReveal from "./LogoReveal";

const FEATURES = [
  { title: "班级学情总览", detail: "测验、路径、资源与掌握度按班级汇总，一眼看清进度" },
  { title: "学生学习档案", detail: "关注学习进展与薄弱内容" },
  { title: "教学评估报告", detail: "基于真实学习证据生成评估结论与教学建议" },
];

/** 登录/注册页左侧品牌故事区（绿色渐变 + 网格纹理 + 功能亮点，与学生端同一套视觉）。
 *  introLocked：首次进入时全屏入场遮罩覆盖期间为 true，此时 logo 静态呈现最终态。 */
export default function LoginHero({ introLocked = false }: { introLocked?: boolean }) {
  return (
    <div className="lm-login-hero">
      <div className="lm-login-hero__grid" aria-hidden="true" />
      <div className="lm-login-hero__content">
        <div className="lm-login-hero__brand">
          <span className="lm-login-hero__mark" aria-hidden="true">
            <LogoReveal size={34} static={introLocked} />
          </span>
          <div>
            <strong>寻笺</strong>
            <span>教师工作台</span>
          </div>
        </div>
        <h1>面向 CS 专业课的教学数据平台</h1>
        <p className="lm-login-hero__slogan">数据驱动 · 精准教学</p>
        <ul className="lm-login-hero__features">
          {FEATURES.map((item) => (
            <li key={item.title}>
              <span className="lm-login-hero__check" aria-hidden="true">
                <Check />
              </span>
              <div>
                <strong>{item.title}</strong>
                <span>{item.detail}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
