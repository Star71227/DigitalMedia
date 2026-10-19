/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useEffect, useRef } from "react";

interface Star {
  x: number;
  y: number;
  bx: number;
  by: number;
  vx: number;
  vy: number;
  r: number;
  shape: "sparkle" | "star5";
  rot: number;
  cr: number;
  cg: number;
  cb: number;
  baseA: number;
  twinkle: number; // 0 常亮 → 1 全幅度闪烁
  speed: number; // 闪烁角速度 rad/ms
  phase: number;
  wa: number; // 游移幅度
  ws: number; // 游移角速度
  wp: number; // 游移相位
}

const REPEL_R = 210;
const REPEL_R2 = REPEL_R * REPEL_R;
const MAX_SPEED = 22;

// 琥珀金 / 浅金 / 暖橙，绝大多数为琥珀金（浅色画布上的金色星光）
const COLORS: Array<[number, number, number]> = [
  [232, 185, 60],
  [255, 209, 102],
  [255, 138, 61],
];

/**
 * 登录页背景星光层：星星散布在浅色画布上，鼠标靠近时被柔和推开，
 * 离开后带阻尼弹回原位；约 1/3 星星会周期性闪烁并带光晕，其余轻微
 * 呼吸或常亮；另加极轻微的游移让画面保持生气。
 * prefers-reduced-motion 下只绘制静态星星。
 */
export default function DotField() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let stars: Star[] = [];
    let width = 0;
    let height = 0;
    let raf = 0;
    let last = 0;
    const pointer = { x: -9999, y: -9999, active: false };

    const pickColor = () => {
      const roll = Math.random();
      return roll < 0.86 ? COLORS[0] : roll < 0.93 ? COLORS[1] : COLORS[2];
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.min(900, Math.max(200, Math.round((width * height) / 2200)));
      stars = Array.from({ length: count }, () => {
        const r = 2.2 + Math.random() * 4.6;
        const [cr, cg, cb] = pickColor();
        const roll = Math.random();
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          bx: Math.random() * width,
          by: Math.random() * height,
          vx: 0,
          vy: 0,
          r,
          shape: (Math.random() < 0.72 || r < 2.6 ? "sparkle" : "star5") as Star["shape"],
          rot: Math.random() * Math.PI,
          cr,
          cg,
          cb,
          baseA: 0.3 + Math.random() * 0.35,
          twinkle: roll < 0.35 ? 0.6 + Math.random() * 0.4 : roll < 0.7 ? 0.15 + Math.random() * 0.2 : 0,
          speed: 0.001 + Math.random() * 0.004,
          phase: Math.random() * Math.PI * 2,
          wa: 2 + Math.random() * 4,
          ws: 0.0004 + Math.random() * 0.0008,
          wp: Math.random() * Math.PI * 2,
        };
      });
    };

    const drawStars = (now: number) => {
      ctx.clearRect(0, 0, width, height);
      for (const star of stars) {
        const pulse = 0.5 + 0.5 * Math.sin(now * star.speed + star.phase);
        const alpha = star.baseA * (1 - star.twinkle + star.twinkle * pulse);
        if (alpha <= 0.02) continue;
        const r = star.r * (1 + 0.15 * pulse * star.twinkle);
        if (star.twinkle > 0.5 && pulse > 0.65) {
          const haloR = r * 3.2;
          const halo = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, haloR);
          halo.addColorStop(0, `rgba(${star.cr},${star.cg},${star.cb},${(alpha * 0.6).toFixed(3)})`);
          halo.addColorStop(1, `rgba(${star.cr},${star.cg},${star.cb},0)`);
          ctx.fillStyle = halo;
          ctx.fillRect(star.x - haloR, star.y - haloR, haloR * 2, haloR * 2);
        }
        ctx.fillStyle = `rgba(${star.cr},${star.cg},${star.cb},${alpha.toFixed(3)})`;
        ctx.beginPath();
        if (star.shape === "star5") {
          const innerR = r * 0.45;
          for (let i = 0; i < 10; i += 1) {
            const radius = i % 2 === 0 ? r : innerR;
            const angle = (Math.PI / 5) * i - Math.PI / 2 + star.rot;
            const px = star.x + Math.cos(angle) * radius;
            const py = star.y + Math.sin(angle) * radius;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
        } else {
          ctx.moveTo(star.x, star.y - r);
          ctx.quadraticCurveTo(star.x, star.y, star.x + r, star.y);
          ctx.quadraticCurveTo(star.x, star.y, star.x, star.y + r);
          ctx.quadraticCurveTo(star.x, star.y, star.x - r, star.y);
          ctx.quadraticCurveTo(star.x, star.y, star.x, star.y - r);
          ctx.closePath();
        }
        ctx.fill();
      }
    };

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 16.667 || 1, 2);
      last = now;
      for (const star of stars) {
        const wanderX = Math.sin(now * star.ws + star.wp) * star.wa;
        const wanderY = Math.cos(now * star.ws * 1.3 + star.wp) * star.wa;
        let ax = (star.bx + wanderX - star.x) * 0.03;
        let ay = (star.by + wanderY - star.y) * 0.03;
        if (pointer.active) {
          const dx = star.x - pointer.x;
          const dy = star.y - pointer.y;
          const dist2 = dx * dx + dy * dy;
          if (dist2 < REPEL_R2 && dist2 > 0.01) {
            const dist = Math.sqrt(dist2);
            const force = ((REPEL_R - dist) / REPEL_R) ** 2 * 7;
            ax += (dx / dist) * force;
            ay += (dy / dist) * force;
          }
        }
        star.vx = (star.vx + ax * dt) * 0.9;
        star.vy = (star.vy + ay * dt) * 0.9;
        const speed = Math.hypot(star.vx, star.vy);
        if (speed > MAX_SPEED) {
          star.vx = (star.vx / speed) * MAX_SPEED;
          star.vy = (star.vy / speed) * MAX_SPEED;
        }
        star.x += star.vx * dt;
        star.y += star.vy * dt;
      }
      drawStars(now);
      raf = requestAnimationFrame(frame);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
    };

    const onResize = () => {
      resize();
      if (prefersReduced) drawStars(0);
    };

    resize();
    if (prefersReduced) {
      drawStars(0);
      window.addEventListener("resize", onResize);
    } else {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      window.addEventListener("resize", onResize);
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="lm-dot-field" aria-hidden="true" />;
}
