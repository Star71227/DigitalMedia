/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import "./jsdom-shims";
import { afterAll } from "vitest";
import { ScrollTrigger } from "../../frontend-teacher/src/lib/gsap";
import { ScrollTrigger as StudentScrollTrigger } from "../src/lib/gsap";

/* gsap 的 ScrollTrigger 核心初始化时会跑一条永续 setInterval(_sync, 250) 保持滚动同步,
   _sync 拍内引用裸 requestAnimationFrame。vitest 环境销毁时会删除
   globalThis.requestAnimationFrame,残留的下一拍就会 ReferenceError。
   注意两端 barrel 是两份独立 gsap 实例:setup 直接持有的教师端实例可 disable 清理,
   但被测组件经 src/lib/gsap 加载的学生端实例若不清理,它的 interval 会漏出文件生命周期。
   afterAll 里两个实例都杀触发器 + disable(内部 clearInterval)再留一拍走完。 */
ScrollTrigger.enable(); // 幂等:保证上一个测试文件 disable 不残留

afterAll(async () => {
  [ScrollTrigger, StudentScrollTrigger].forEach((instance) => {
    instance.getAll().forEach((trigger) => trigger.kill());
    instance.disable();
  });
  await new Promise((resolve) => window.setTimeout(resolve, 50));
});
