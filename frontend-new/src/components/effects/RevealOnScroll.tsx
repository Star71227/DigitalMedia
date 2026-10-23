import { useRef, type ReactNode } from "react";
import { gsap, ScrollTrigger, prefersReducedMotion, useGSAP } from "../../lib/gsap";

interface RevealOnScrollProps { children: ReactNode; className?: string; stagger?: number; y?: number; start?: string; }

export function RevealOnScroll({ children, className, stagger = .06, y = 8, start = "top 85%" }: RevealOnScrollProps) {
  const scopeRef = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    // Labels own their reveal; parent opacity must not hide persistent units or axes.
    if (scopeRef.current?.closest(".bp-app-shell") || prefersReducedMotion()) return;
    const targets = gsap.utils.toArray<HTMLElement>("[data-reveal]", scopeRef.current);
    if (!targets.length) return;
    gsap.set(targets, { opacity: 0, y });
    ScrollTrigger.batch(targets, { start, once: true, onEnter: batch => gsap.to(batch, { opacity: 1, y: 0, duration: .48, stagger, ease: "power2.out", overwrite: true, clearProps: "transform" }) });
  }, { scope: scopeRef });
  return <div ref={scopeRef} className={className}>{children}</div>;
}
