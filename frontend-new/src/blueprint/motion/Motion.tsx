import type { ReactNode } from "react";

export type LabelLevel = "A" | "B" | "C";
export type CarrierShape = "plate" | "tab" | "rail" | "ring" | "disc" | "mesh" | "snow" | "fan" | "none";

export const labelProps = (
  level: LabelLevel,
  carrier: CarrierShape,
  enter: "reveal" | "attach" | "draw" | "persist",
  i = 0,
) => ({ "data-level": level, "data-carrier": carrier, "data-enter": enter, "data-mg-i": i });

export function Carrier({ shape, className = "" }: { shape: CarrierShape; className?: string }) {
  if (shape === "snow" || shape === "fan") {
    const rays = shape === "snow" ? 8 : 32;
    return <svg className={`mg-carrier mg-carrier--${shape} ${className}`} viewBox="0 0 200 200" aria-hidden="true"><g>{Array.from({ length: rays }, (_, i) => <path key={i} pathLength="1" style={{ "--mg-ray": i } as import("react").CSSProperties} transform={`rotate(${i * 360 / rays} 100 100)`} d={shape === "snow" ? "M100 100 L100 16 M100 42 L90 32 M100 42 L110 32" : "M100 100 L100 8"} />)}</g></svg>;
  }
  if (shape === "mesh" && /floor|mentor/.test(className)) {
    return <svg className={`mg-carrier mg-carrier--mesh ${className}`} viewBox="0 0 400 200" preserveAspectRatio="none" aria-hidden="true"><path fill="none" d={Array.from({ length: 11 }, (_, i) => `M${i * 40} 0V200 M0 ${i * 20}H400`).join(" ")} /></svg>;
  }
  if (shape === "mesh") {
    return <svg className={`mg-carrier mg-carrier--mesh ${className}`} viewBox="0 0 200 200" aria-hidden="true"><g>{Array.from({ length: 25 }, (_, i) => <rect key={i} x={12 + i % 5 * 38} y={12 + Math.floor(i / 5) * 38} width="20" height="20" rx="2" style={{ "--mg-dot": i } as import("react").CSSProperties} />)}</g></svg>;
  }
  if (shape === "rail") return <svg className={`mg-carrier mg-carrier--rail ${className}`} viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M0 10H200" /></svg>;
  if (shape === "ring") {
    return <svg className={`mg-carrier mg-carrier--ring ${className}`} viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="48" pathLength="1" /></svg>;
  }
  return <div className={`mg-carrier mg-carrier--${shape} ${className}`} aria-hidden="true" />;
}

export function Stage({ motif, children }: { motif: string; children: ReactNode }) {
  return <div className="mg-stage" data-mg-motif={motif}>{children}</div>;
}
