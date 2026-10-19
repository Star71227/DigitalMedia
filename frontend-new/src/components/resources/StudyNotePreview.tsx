/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import React from "react";
import { AlertTriangle, CheckCircle2, Lightbulb, Target } from "lucide-react";

export interface StudyNoteContent {
  personalizedObjectives: string[];
  foundationSummary: string[] | string;
  coreConcepts: Array<{ title: string; explanation: string; importance: string }>;
  diagrams: Array<{ title: string; description: string; steps: string[] }>;
  methodsAndFormulas: Array<{ title: string; expression: string; explanation: string; conditions: string[] }>;
  workedExamples: Array<{ question: string; steps: string[]; answer: string }>;
  commonMistakes: Array<{ mistake: string; reason: string; correction: string }>;
  practiceTasks: Array<{ prompt: string; hint: string; answerGuide: string }>;
  studyAdvice: string[];
  citationBasis: string[];
}

export default function StudyNotePreview({ content }: { content: StudyNoteContent }) {
  return (
    <div className="bp-note">
      <section className="bp-note-overview">
        <div className="bp-note-overview__index">00</div>
        <div>
          <span>FOUNDATION / START HERE</span>
          <h3>当前基础摘要</h3>
          <p>{String(content.foundationSummary)}</p>
        </div>
        <div className="bp-note-objectives">
          <Target />
          <strong>本节目标</strong>
          {content.personalizedObjectives.slice(0, 3).map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </section>

      <section className="bp-note-section">
        <header>
          <span>01</span>
          <div>
            <small>CORE CONCEPTS</small>
            <h3>核心概念</h3>
          </div>
        </header>
        <div className="bp-note-concept-grid">
          {content.coreConcepts.map((item, index) => (
            <article key={item.title}>
              <b>{String(index + 1).padStart(2, "0")}</b>
              <div>
                <h4>{item.title}</h4>
                <span className={`is-${item.importance}`}>{importanceLabel(item.importance)}</span>
              </div>
              <p>{item.explanation}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="bp-note-split">
        <section className="bp-note-section bp-note-section--process">
          <header>
            <span>02</span>
            <div>
              <small>VISUAL PROCESS</small>
              <h3>图示理解</h3>
            </div>
          </header>
          {content.diagrams.map((item) => (
            <article key={item.title} className="bp-note-process">
              <h4>{item.title}</h4>
              <p>{item.description}</p>
              <ol>
                {item.steps.map((step, index) => (
                  <li key={`${step}-${index}`}>
                    <b>{index + 1}</b>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </section>

        <section className="bp-note-section bp-note-section--method">
          <header>
            <span>03</span>
            <div>
              <small>METHOD / FORMULA</small>
              <h3>方法与公式</h3>
            </div>
          </header>
          {content.methodsAndFormulas.map((item) => (
            <article key={item.title} className="bp-note-method">
              <h4>{item.title}</h4>
              <code>{item.expression}</code>
              <p>{item.explanation}</p>
              {item.conditions.length > 0 && (
                <ul>
                  {item.conditions.map((condition) => (
                    <li key={condition}>{condition}</li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </section>
      </div>

      <section className="bp-note-section bp-note-section--examples">
        <header>
          <span>04</span>
          <div>
            <small>WORKED EXAMPLES</small>
            <h3>例题拆解</h3>
          </div>
        </header>
        <div className="bp-note-example-grid">
          {content.workedExamples.map((item, index) => (
            <article key={item.question}>
              <span>CASE {String(index + 1).padStart(2, "0")}</span>
              <h4>{item.question}</h4>
              <ol>
                {item.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <p>
                <CheckCircle2 />
                <strong>结论</strong>
                {item.answer}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="bp-note-section bp-note-section--mistakes">
        <header>
          <span>05</span>
          <div>
            <small>CHECKPOINT</small>
            <h3>易错点</h3>
          </div>
        </header>
        <div className="bp-note-mistake-grid">
          {content.commonMistakes.map((item) => (
            <article key={item.mistake}>
              <AlertTriangle />
              <div>
                <strong>{item.mistake}</strong>
                <p>原因：{item.reason}</p>
                <p>纠正：{item.correction}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="bp-note-section bp-note-section--practice">
        <header>
          <span>06</span>
          <div>
            <small>PRACTICE</small>
            <h3>巩固练习</h3>
          </div>
        </header>
        <div>
          {content.practiceTasks.map((item, index) => (
            <details key={item.prompt}>
              <summary>
                <b>{String(index + 1).padStart(2, "0")}</b>
                <span>{item.prompt}</span>
              </summary>
              <p>
                <Lightbulb />
                提示：{item.hint}
              </p>
              <p>参考评分点：{item.answerGuide}</p>
            </details>
          ))}
        </div>
      </section>

      <details className="bp-note-appendix">
        <summary>
          学习建议与引用依据 <span>APPENDIX +</span>
        </summary>
        <div>
          <SmallList title="学习目标" items={content.personalizedObjectives} />
          <SmallList title="学习建议" items={content.studyAdvice} />
          <SmallList title="引用依据" items={content.citationBasis} />
        </div>
      </details>
    </div>
  );
}

function SmallList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4>{title}</h4>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function importanceLabel(value: string) {
  if (value === "high") return "重点";
  if (value === "medium") return "常规";
  return "补充";
}
