/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
/* 测试环境补齐 jsdom 缺失的浏览器 API(必须早于任何 gsap import 求值,
   故单独成文件并被 tests/setup.ts 第一个 import)。
   GSAP 的 ScrollTrigger / MatchMedia 在插件注册与运行时都要调用 window.matchMedia,
   jsdom 不实现它;这里提供一个接口齐全的 stub,所有媒体查询均返回不匹配
   (含 prefers-reduced-motion: reduce → 测试中动效照常走完整路径)。 */

if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  });
}

/* DotField 等组件调用 canvas.getContext('2d'):jsdom 会向 stderr 打印
   "Not implemented" 并抛错(PS 5.1 下 stderr 会让 npm 报失败)。组件对 null 有守卫,
   直接返回 null 静默短路。 */
if (typeof window !== "undefined" && typeof HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
}

/* ScrollTrigger 刷新走 requestAnimationFrame;jsdom 未开 pretendToBeVisual 时没有 rAF。
   同时挂到 globalThis:外部化的 gsap CJS 直接引用裸 requestAnimationFrame 全局变量 */
if (typeof window !== "undefined" && typeof window.requestAnimationFrame !== "function") {
  window.requestAnimationFrame = ((callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(Date.now()), 16)) as unknown as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = ((handle: number) =>
    window.clearTimeout(handle)) as typeof window.cancelAnimationFrame;
}
if (typeof globalThis.requestAnimationFrame !== "function") {
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) =>
    setTimeout(() => callback(Date.now()), 16)) as unknown as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((handle: number) =>
    clearTimeout(handle)) as unknown as typeof cancelAnimationFrame;
}
