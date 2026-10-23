/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { Check } from "lucide-react";
import LogoReveal from "./LogoReveal";

const FEATURES = [
  { title: "个性化学习路径", detail: "基于知识图谱定位薄弱点，智能推荐练习" },
  { title: "AI 学情诊断", detail: "学习行为与测验数据实时分析，生成专属报告" },
  { title: "专注计时与学习统计", detail: "打卡、专注与测验用时自动汇总留存" },
];

/** 登录/注册页左侧品牌故事区（绿色渐变 + 网格纹理 + 功能亮点）。
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
            <span>学生学习工作台</span>
          </div>
        </div>
        <h1>AI 驱动的 CS 专业课学习平台</h1>
        <p className="lm-login-hero__slogan">智能伴学 · 千人千面</p>
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
