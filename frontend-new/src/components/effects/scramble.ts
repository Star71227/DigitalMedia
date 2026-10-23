/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { gsap } from "../../lib/gsap";

/** ScrambleTextPlugin 乱码落定(gsap 3.13 起全部插件随 npm 包免费):
 *  先写入同长度随机池字符,再滚动到终值。CountUp 与 ScrambleNumber 共用,
 *  保证单一实现(防双实现漂移)。调用方负责 reduced-motion 判定;
 *  本函数内部先 killTweensOf 防重入(StrictMode 双挂载安全)。 */
export function scrambleTo(el: HTMLElement, finalText: string, chars = "0123456789", duration = 0.6): void {
  gsap.killTweensOf(el);
  el.textContent = Array.from(
    { length: finalText.length },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join("");
  gsap.to(el, {
    duration,
    scrambleText: { text: finalText, chars },
    ease: "power2.out",
  });
}
