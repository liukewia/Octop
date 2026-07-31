import { useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import styles from "./ChannelsSection.module.less";

const CHANNELS = [
  { name: "Feishu", icon: "🚀", color: "#00A2FF" },
  { name: "DingTalk", icon: "📎", color: "#2379FF" },
  { name: "QQ", icon: "🐧", color: "#1DA1F2" },
  { name: "Discord", icon: "🎮", color: "#5865F2" },
  { name: "WeCom", icon: "💬", color: "#07C160" },
  { name: "WebChat", icon: "🌐", color: "#00D4FF" },
] as const;

function OrbitCanvas({ count }: { count: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const angleRef = useRef(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    ctx.clearRect(0, 0, W, H);

    angleRef.current += 0.006;
    const a = angleRef.current;

    // Orbit ring
    ctx.beginPath();
    ctx.ellipse(cx, cy, cx * 0.72, cy * 0.72, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0,212,255,0.1)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 8]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Data stream dots on orbit
    for (let i = 0; i < 8; i++) {
      const theta = a * 1.5 + (i / 8) * Math.PI * 2;
      const x = cx + Math.cos(theta) * cx * 0.72;
      const y = cy + Math.sin(theta) * cy * 0.72;
      const alpha = 0.15 + Math.abs(Math.sin(theta + a)) * 0.4;
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,212,255,${alpha})`;
      ctx.fill();
    }

    // Lines from center to each channel (distributed evenly)
    const channels = count;
    for (let i = 0; i < channels; i++) {
      const theta = (i / channels) * Math.PI * 2 + a * 0.1;
      const ex = cx + Math.cos(theta) * cx * 0.72;
      const ey = cy + Math.sin(theta) * cy * 0.72;

      // Animated dashes
      const progress = (a * 0.5 + i * 0.3) % 1;
      const sx = cx + (ex - cx) * Math.max(0, progress - 0.3);
      const sy = cy + (ey - cy) * Math.max(0, progress - 0.3);
      const lx = cx + (ex - cx) * Math.min(1, progress + 0.3);
      const ly = cy + (ey - cy) * Math.min(1, progress + 0.3);

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(lx, ly);
      ctx.strokeStyle = "rgba(0,212,255,0.25)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    rafRef.current = requestAnimationFrame(draw);
  }, [count]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={600}
      className={styles.orbitCanvas}
    />
  );
}

export function ChannelsSection() {
  const { t } = useTranslation();

  return (
    <section className={styles.section} id="channels">
      <div className={styles.header}>
        <h2 className={styles.title}>{t("channels.title")}</h2>
        <p className={styles.subtitle}>{t("channels.subtitle")}</p>
      </div>

      <div className={styles.orbitWrapper}>
        <OrbitCanvas count={CHANNELS.length} />

        {/* Center octop indicator */}
        <div className={styles.center}>
          <span className={styles.centerIcon}>🐙</span>
          <span className={styles.centerLabel}>Octop</span>
        </div>

        {/* Channel icons distributed in orbit */}
        {CHANNELS.map((ch, i) => {
          const theta = (i / CHANNELS.length) * Math.PI * 2 - Math.PI / 2;
          const r = 42; /* percent of wrapper width */
          const x = 50 + r * Math.cos(theta);
          const y = 50 + r * Math.sin(theta);
          return (
            <div
              key={ch.name}
              className={styles.channelNode}
              style={{ left: `${x}%`, top: `${y}%`, "--color": ch.color } as React.CSSProperties}
            >
              <span className={styles.channelIcon}>{ch.icon}</span>
              <span className={styles.channelName}>{ch.name}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
