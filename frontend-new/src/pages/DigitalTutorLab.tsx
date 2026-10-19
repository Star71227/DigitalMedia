/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useState } from "react";
import DigitalTutor from "../components/digitalTutor/DigitalTutor";
import DigitalTutorAvatar from "../components/digitalTutor/DigitalTutorAvatar";
import type { DigitalTutorState } from "../types/digitalTutor";
import "../components/digitalTutor/digitalTutor.css";

const lessons = [
  {
    topic: "二叉树遍历",
    title: "正在讲解：二叉树遍历",
    text: "二叉树的递归遍历可以分为前序、中序和后序。它们的区别，在于访问根节点的时机：前序先访问根，中序在左右子树之间访问根，后序最后访问根。",
  },
  {
    topic: "时间复杂度",
    title: "正在讲解：时间复杂度",
    text: "时间复杂度描述输入规模增长时，算法运行时间的变化趋势。大 O 记号忽略常数和低阶项，帮助我们比较算法在大规模数据下的效率。",
  },
  {
    topic: "进程与线程",
    title: "正在讲解：操作系统进程与线程",
    text: "进程是资源分配的基本单位，线程是处理器调度的基本单位。同一进程内的线程共享地址空间和大部分资源，但每个线程拥有自己的栈和执行上下文。",
  },
];

const states: DigitalTutorState[] = [
  "idle",
  "listening",
  "thinking",
  "speaking",
  "paused",
  "encouraging",
  "error",
];
const stateNames: Record<DigitalTutorState, string> = {
  idle: "待机",
  listening: "聆听",
  thinking: "思考",
  speaking: "讲解",
  paused: "暂停",
  encouraging: "鼓励",
  error: "错误",
  disabled: "关闭",
};

export default function DigitalTutorLab() {
  const [lessonIndex, setLessonIndex] = useState(0);
  const [demoState, setDemoState] = useState<DigitalTutorState>("idle");
  const [simulateAudioError, setSimulateAudioError] = useState(false);
  const lesson = lessons[lessonIndex];

  return (
    <main className="dt-lab">
      <div className="dt-lab__glow dt-lab__glow--one" />
      <div className="dt-lab__glow dt-lab__glow--two" />
      <header className="dt-lab__hero">
        <div>
          <p>LEARNMATE · PROTOTYPE LAB</p>
          <h1>数字讲师「小智」</h1>
          <span>轻量 2D 角色 · 浏览器原生语音 · 双模式口型同步</span>
        </div>
        <div className="dt-lab__chip">
          <i /> 独立 MVP 模块
        </div>
      </header>

      <section className="dt-lab__layout" aria-label="数字讲师交互面板">
        <div className="dt-lab__main">
          <DigitalTutor
            name="小智"
            text={lesson.text}
            title={lesson.title}
            subtitle="静态教学示例，不代表真实学习成绩"
            state={demoState}
            audioUrl={simulateAudioError ? "/__digital-tutor-missing-audio__.mp3" : undefined}
            onStateChange={setDemoState}
          />
        </div>
        <aside className="dt-lab__console">
          <div className="dt-lab__console-title">
            <span>示例控制台</span>
            <small>DEMO CONTROLS</small>
          </div>
          <div className="dt-lab__group">
            <label>状态场景</label>
            <div className="dt-lab__state-grid">
              {states.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={demoState === item ? "is-active" : ""}
                  onClick={() => setDemoState(item)}
                  aria-pressed={demoState === item}
                >
                  {stateNames[item]}
                </button>
              ))}
            </div>
          </div>
          <div className="dt-lab__group">
            <label>模拟 PPT 讲稿切换</label>
            <div className="dt-lab__slides">
              {lessons.map((item, index) => (
                <button
                  key={item.topic}
                  type="button"
                  onClick={() => {
                    setLessonIndex(index);
                    setDemoState("thinking");
                  }}
                  className={lessonIndex === index ? "is-active" : ""}
                  aria-pressed={lessonIndex === index}
                >
                  <b>0{index + 1}</b>
                  <span>
                    {item.topic}
                    <small>静态讲稿</small>
                  </span>
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            className="dt-lab__error-test"
            aria-pressed={simulateAudioError}
            onClick={() => setSimulateAudioError((value) => !value)}
          >
            {simulateAudioError ? "退出音频错误模拟" : "模拟 audioUrl 加载失败"}
          </button>
          <p className="dt-lab__note">
            提示：首次播放需用户点击，以符合浏览器自动播放策略。浏览器语音模式的口型是状态动画，不是真实振幅。
          </p>
        </aside>
      </section>

      <section className="dt-lab__gallery" aria-labelledby="state-gallery-title">
        <div className="dt-lab__section-heading">
          <div>
            <p>STATE SYSTEM</p>
            <h2 id="state-gallery-title">角色状态一览</h2>
          </div>
          <span>状态不仅通过颜色表达，同时提供文字标签</span>
        </div>
        <div className="dt-lab__cards">
          {(["idle", "thinking", "encouraging", "error"] as DigitalTutorState[]).map((item) => (
            <article key={item}>
              <DigitalTutorAvatar state={item} mouthOpen={0} name="小智" compact />
              <div>
                <b>{stateNames[item]}</b>
                <code>{item}</code>
              </div>
            </article>
          ))}
        </div>
      </section>

      <footer className="dt-lab__footer">
        <span>智课研伴 · 数字讲师实验室</span>
        <span>本地原创 SVG / CSS，无远程商业素材</span>
      </footer>
    </main>
  );
}
