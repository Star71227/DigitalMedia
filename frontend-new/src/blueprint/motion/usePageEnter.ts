import { useLayoutEffect } from "react";
import { labelRules, orientationMatrix } from "./labelRegistry";

export function usePageEnter(activeTab: string) {
  useLayoutEffect(() => {
    const html = document.documentElement;
    const main = document.querySelector<HTMLElement>(".bp-main");
    if (!main) return;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const reduced = () => html.dataset.motion === "reduce" || media.matches;
    let disposed = false, started = false, scanQueued = false;
    let frame1 = 0, frame2 = 0, page: HTMLElement | undefined;
    let graphFrame: HTMLIFrameElement | null = null;
    const bound = new WeakSet<Element>();
    const states = new WeakMap<Element, string>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const pending = new Set<HTMLElement>();
    const inViewport = (node: Element) => {
      const b = node.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && b.top < innerHeight && b.bottom > 0;
    };
    const appear = (node: HTMLElement) => {
      if (!started || !html.classList.contains("is-mg-in")) return;
      node.dataset.mgEntered = "";
      pending.delete(node);
      intersection.unobserve(node);
    };
    // Only the first viewport is enrolled. Long lists never replay on scroll.
    const intersection = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) appear(entry.target as HTMLElement);
    }, { threshold: 0 });

    function syncGraph() {
      try {
        const doc = graphFrame?.contentDocument;
        if (!doc?.body) return;
        doc.documentElement.dataset.mgGraph = "";
        doc.documentElement.dataset.motion = reduced() ? "reduce" : "standard";
        for (const token of ["--bp-blue", "--bp-paper", "--bp-line"]) {
          doc.documentElement.style.setProperty(token, getComputedStyle(html).getPropertyValue(token));
        }
        if (!doc.getElementById("mg-graph-labels")) {
          const style = doc.createElement("style"); style.id = "mg-graph-labels";
          style.textContent = [...document.styleSheets].flatMap(sheet => {
            try { return [...sheet.cssRules].filter(rule => rule.cssText.includes("[data-mg-graph]")).map(rule => rule.cssText); }
            catch { return []; }
          }).join("\n");
          doc.head.append(style);
        }
        for (const node of doc.querySelectorAll<HTMLElement>(".legend > span, #graph text")) {
          node.dataset.level = "B"; node.dataset.carrier = "tab";
          node.dataset.enter = "persist"; node.dataset.mgBehavior = "persist";
          node.dataset.family = node.matches(".legend > span") ? "F06" : "F07";
        }
        const flat = doc.getElementById("btnGalaxy");
        if (reduced() && flat?.classList.contains("is-on")) flat.click();
      } catch { /* Cross-origin embeds keep their own presentation. */ }
    }

    function classify() {
      for (const rule of labelRules) {
        for (const node of document.querySelectorAll<HTMLElement>(rule.selector)) {
          if (!node.closest(".bp-app-shell")) continue;
          node.dataset.level = rule.level; node.dataset.carrier = rule.carrier;
          node.dataset.family = rule.family; node.dataset.mgBehavior = rule.behavior;
          if (rule.group) node.dataset.mgContainer = "";
        }
      }
      const lateLabels: HTMLElement[] = [];
      for (const node of document.querySelectorAll<HTMLElement>(".bp-app-shell [data-level]")) {
        const isNew = !bound.has(node);
        if (!node.dataset.family) node.dataset.family = "F15";
        if (!node.dataset.mgBehavior) node.dataset.mgBehavior = "reveal";
        if (node.dataset.family === "F04") {
          const card = node.closest("article, .bp-settings-group, .bp-class-list__item, .bp-homework-item");
          if (card?.querySelector('[data-level="A"]:not([data-family="F04"])')) {
            node.dataset.level = "B"; node.dataset.carrier = "tab";
          }
          const text = node.textContent ?? "";
          if (!isNew && states.has(node) && states.get(node) !== text && !reduced()) {
            node.dataset.mgFlip = "";
            const timer = setTimeout(() => { delete node.dataset.mgFlip; timers.delete(timer); }, 180);
            timers.add(timer);
          }
          states.set(node, text);
        }
        const shape = node.dataset.carrier;
        const angle = node.dataset.level === "A" ? shape === "disc" ? orientationMatrix.disc : orientationMatrix.plate : orientationMatrix.tab;
        node.style.setProperty("--mg-rx", `${node.dataset.family === "F14" && node.dataset.level === "A" ? 12 : angle.rx}deg`);
        node.style.setProperty("--mg-ry", `${angle.ry}deg`);
        node.style.setProperty("--mg-rz", `${angle.rz}deg`);
        if (isNew) {
          node.dataset.enter = "persist";
          node.dataset.mgEntered = "";
          bound.add(node);
          if (started && ["F12", "F13"].includes(node.dataset.family) && inViewport(node) && !reduced()) lateLabels.push(node);
        }
      }
      if (lateLabels.length) enroll(lateLabels, true);
      const frame = main!.querySelector<HTMLIFrameElement>(".bp-mindmap-embed__frame");
      if (frame && frame !== graphFrame) {
        graphFrame?.removeEventListener("load", syncGraph); graphFrame = frame;
        graphFrame.addEventListener("load", syncGraph); syncGraph();
      }
    }

    function enroll(candidates: HTMLElement[], late = false) {
      const visible = candidates.filter(node => inViewport(node) && node.dataset.mgBehavior === "reveal" && !node.hasAttribute("data-mg-container") && !node.closest(".bp-page-header, .bp-sidebar, .bp-side-hud"));
      const selected = [
        ...visible.filter(node => node.dataset.level === "A").slice(0, 4),
        ...visible.filter(node => node.dataset.level === "B").slice(0, late ? 6 : 4),
      ].slice(0, 8);
      let a = 0, b = 0;
      for (const node of selected) {
        if (late && pending.size >= 6) break;
        const primary = node.dataset.level === "A";
        const i = primary ? a++ : b++;
        node.dataset.enter = primary ? "reveal" : "attach";
        node.style.setProperty("--mg-delay", late ? `${i * 30}ms` : primary ? `${i < 2 ? 0 : 420}ms` : `${460 + i * 30}ms`);
        delete node.dataset.mgEntered;
        pending.add(node); intersection.observe(node);
      }
      if (late) frame1 = requestAnimationFrame(() => pending.forEach(appear));
    }

    function begin() {
      if (disposed) return;
      classify();
      if (started) return;
      page = [...main!.querySelectorAll<HTMLElement>(".bp-page, .bp-resource-page")].find(node => node.getClientRects().length > 0);
      if (!page || page.querySelector(".bp-path-stairs.is-loading")) return;
      page.dataset.mgPage = activeTab;
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      const heading = page.querySelector<HTMLElement>("h1");
      if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
      page.querySelectorAll("[data-mg-draw]").forEach(n => n.removeAttribute("data-mg-draw"));
      [...page.querySelectorAll(".bp-motif .mg-draw, .bp-chart-line.mg-draw, .bp-ranking-techfield__trace.mg-draw")].slice(0, 2).forEach(n => n.setAttribute("data-mg-draw", ""));
      page.querySelector(".bp-radar-ring")?.setAttribute("data-mg-outer", "");
      for (const svg of page.querySelectorAll<SVGSVGElement>("svg")) {
        if (svg.querySelector("animateMotion")) { svg.pauseAnimations(); svg.setCurrentTime(0); }
      }
      if (!reduced()) enroll([...page.querySelectorAll<HTMLElement>("[data-level]")]);
      started = true;
      html.dataset.mgReady = "";
      html.classList.remove("is-mg-in");
      const finish = () => {
        if (disposed) return;
        html.classList.add("is-mg-in");
        pending.forEach(appear);
      };
      if (reduced()) finish();
      else frame1 = requestAnimationFrame(() => { frame2 = requestAnimationFrame(finish); });
    }

    function preference() {
      if (reduced()) {
        pending.forEach(node => { node.dataset.mgEntered = ""; intersection.unobserve(node); });
        pending.clear(); html.classList.add("is-mg-in");
        main!.style.removeProperty("--mg-pointer-x"); main!.style.removeProperty("--mg-pointer-y");
      }
      syncGraph();
    }
    const preferenceObserver = new MutationObserver(preference);
    preferenceObserver.observe(html, { attributes: true, attributeFilter: ["data-motion"] });
    media.addEventListener("change", preference);
    const observer = new MutationObserver(() => {
      if (scanQueued) return;
      scanQueued = true;
      queueMicrotask(() => { scanQueued = false; begin(); });
    });
    observer.observe(main, { childList: true, characterData: true, subtree: true });
    const visibility = () => { html.dataset.mgHidden = document.hidden ? "true" : "false"; };
    document.addEventListener("visibilitychange", visibility); visibility();
    const pointer = (event: PointerEvent) => {
      if (activeTab !== "settings" || reduced() || !matchMedia("(pointer:fine)").matches) return;
      main.style.setProperty("--mg-pointer-x", `${(event.clientX / innerWidth - .5) * 4}px`);
      main.style.setProperty("--mg-pointer-y", `${(event.clientY / innerHeight - .5) * 4}px`);
    };
    if (activeTab === "settings") main.addEventListener("pointermove", pointer);
    begin();
    return () => {
      disposed = true; observer.disconnect(); intersection.disconnect(); preferenceObserver.disconnect();
      graphFrame?.removeEventListener("load", syncGraph); media.removeEventListener("change", preference);
      document.removeEventListener("visibilitychange", visibility); main.removeEventListener("pointermove", pointer);
      main.style.removeProperty("--mg-pointer-x"); main.style.removeProperty("--mg-pointer-y");
      cancelAnimationFrame(frame1); cancelAnimationFrame(frame2); timers.forEach(clearTimeout);
    };
  }, [activeTab]);
}
