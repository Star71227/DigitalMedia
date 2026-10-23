import { useEffect, useId, useRef } from "react";

export type DepthVariant = "stage" | "sheet" | "rail";

export function DepthScene({ variant = "stage", section, title, caption, meta,
  accent = true, className = "",
}: {
  variant?: DepthVariant;
  section: string;
  title: [string, string];
  caption: string;
  meta?: string;
  accent?: boolean;
  className?: string;
}) {
  const scene = useRef<HTMLDivElement>(null);
  const patternId = `dpHex-${useId().replace(/:/g, "")}`;

  useEffect(() => {
    const node = scene.current;
    const host = node?.parentElement;
    if (!node || !host) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 900px)");
    let frame = 0;
    let px = 0;
    let py = 0;
    let visible = false;
    const reset = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      px = py = 0;
      node.style.setProperty("--dp-px", "0");
      node.style.setProperty("--dp-py", "0");
    };
    const syncMotion = () => {
      const reduce = reduced.matches || document.documentElement.dataset.motion === "reduce";
      node.dataset.dpReduced = String(reduce);
      if (reduce) {
        node.dataset.dpIn = "true";
        reset();
      }
    };
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (entry.isIntersecting && entry.intersectionRatio >= .2) node.dataset.dpIn = "true";
      if (!visible) reset();
    }, { threshold: [0, .2] });
    observer?.observe(node);
    if (!observer) node.dataset.dpIn = "true";
    const mutation = new MutationObserver(syncMotion);
    mutation.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
    reduced.addEventListener("change", syncMotion);
    finePointer.addEventListener("change", reset);
    syncMotion();
    const move = (event: PointerEvent) => {
      if (!visible || !finePointer.matches || node.dataset.dpReduced === "true" || event.pointerType === "touch") return;
      const bounds = host.getBoundingClientRect();
      px = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1));
      py = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
      if (!frame) frame = requestAnimationFrame(() => {
        node.style.setProperty("--dp-px", px.toFixed(3));
        node.style.setProperty("--dp-py", py.toFixed(3));
        frame = 0;
      });
    };
    host.addEventListener("pointermove", move, { passive: true });
    host.addEventListener("pointerleave", reset);
    return () => {
      observer?.disconnect();
      mutation.disconnect();
      reduced.removeEventListener("change", syncMotion);
      finePointer.removeEventListener("change", reset);
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", reset);
      cancelAnimationFrame(frame);
    };
  }, []);

  const card = <div className="dp-card">
    <span className="dp-card__tab">{section}</span>
    <strong className="dp-card__title"><span>{title[0]}</span>{title[1] && <span>{title[1]}</span>}</strong>
    <p className="dp-card__caption">{caption}</p>
    {meta && <p className="dp-card__meta">{meta}</p>}
  </div>;

  return <div ref={scene} className={`dp-scene dp-scene--${variant} ${className}`.trim()} aria-hidden="true">
    {variant !== "rail" && <svg className="dp-field" width="100%" height="100%" focusable="false">
      <defs><pattern id={patternId} width="56" height="96" patternUnits="userSpaceOnUse">
        <path d="M28 0 56 16v32L28 64 0 48V16Z M0 48 28 64v32L0 112 -28 96V64Z" fill="none" stroke="currentColor" strokeWidth="1" />
      </pattern></defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>}
    {variant === "rail" ? card : <div className="dp-plane">
      {variant === "stage" && <div className="dp-glass" />}
      {card}
    </div>}
    {variant === "stage" && <div className="dp-stack"><i /><i /><i /><i /></div>}
    {accent && <span className="dp-accent" />}
    <p className="dp-footer">POWERED BY <b>LEARNMATE</b></p>
  </div>;
}
