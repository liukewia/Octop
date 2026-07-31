import { useEffect, useRef, useCallback } from "react";

const RING_COUNT = 3;

export function OctopOrbit() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const angleRef = useRef(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = canvas.width;
    const cx = size / 2;
    const cy = size / 2;

    ctx.clearRect(0, 0, size, size);

    angleRef.current += 0.008;
    const angle = angleRef.current;

    for (let i = 0; i < RING_COUNT; i++) {
      const progress = i / RING_COUNT;
      const rx = cx * (0.65 + progress * 0.25);
      const ry = cy * (0.4 + progress * 0.22);
      const rotation = angle * (i % 2 === 0 ? 1 : -1) + (i * Math.PI) / 3;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotation);
      ctx.scale(1, ry / rx);

      const totalLen = 2 * Math.PI * rx;
      const dashLen = totalLen * 0.28;
      const gapLen = totalLen * 0.72;

      ctx.beginPath();
      ctx.ellipse(0, 0, rx, rx, 0, 0, Math.PI * 2);
      ctx.setLineDash([dashLen, gapLen]);
      ctx.lineDashOffset = -angle * rx * (i + 1) * 0.6;

      const gradient = ctx.createLinearGradient(-rx, 0, rx, 0);
      gradient.addColorStop(0, "rgba(0,212,255,0)");
      gradient.addColorStop(0.5, `rgba(0,212,255,${0.5 - progress * 0.15})`);
      gradient.addColorStop(1, "rgba(0,212,255,0)");

      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1.5 - progress * 0.4;
      ctx.shadowColor = "#00D4FF";
      ctx.shadowBlur = 8;
      ctx.stroke();

      ctx.restore();
    }

    // Glow pulse around center
    const pulseRadius = cx * 0.38 + Math.sin(angle * 2) * cx * 0.04;
    const radialGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, pulseRadius);
    radialGrad.addColorStop(0, "rgba(255,107,74,0.08)");
    radialGrad.addColorStop(0.6, "rgba(0,212,255,0.04)");
    radialGrad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.beginPath();
    ctx.arc(cx, cy, pulseRadius, 0, Math.PI * 2);
    ctx.fillStyle = radialGrad;
    ctx.fill();

    rafRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      width={520}
      height={520}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    />
  );
}
