"use client";

import { useEffect, useRef } from "react";

type Node = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: "orange" | "violet";
};

type Packet = {
  fx: number;
  fy: number;
  tx: number;
  ty: number;
  t: number;
  duration: number;
  hue: "orange" | "violet";
};

const NODE_COUNT = 90;
const PACKET_INTERVAL_MS = 280;

// Full-bleed ambient particle field. Renders into whatever container it's
// placed in via `absolute inset-0`. No frame, no edges, no labels — just
// drifting glowing dots and the occasional packet streaking between them.
export function LightningConstellation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let nodes: Node[] = [];
    let packets: Packet[] = [];
    let lastPacketAt = 0;
    let lastTime = performance.now();

    function rect() { return canvas!.getBoundingClientRect(); }

    function resize() {
      if (!canvas || !ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = rect();
      canvas.width = Math.max(1, r.width * dpr);
      canvas.height = Math.max(1, r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function spawnNodes() {
      const r = rect();
      nodes = Array.from({ length: NODE_COUNT }, () => {
        const speed = reduceMotion ? 0 : 0.06 + Math.random() * 0.14;
        const angle = Math.random() * Math.PI * 2;
        return {
          x: Math.random() * r.width,
          y: Math.random() * r.height,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: 0.8 + Math.random() * 1.8,
          color: Math.random() < 0.55 ? "orange" : "violet",
        };
      });
    }

    function spawnPacket() {
      if (nodes.length === 0) return;
      const a = nodes[Math.floor(Math.random() * nodes.length)];
      // Pick another random node within a viewport-relative distance
      const r = rect();
      const maxDist = Math.min(r.width, r.height) * 0.45;
      let best: Node | null = null;
      for (let i = 0; i < 12; i++) {
        const b = nodes[Math.floor(Math.random() * nodes.length)];
        if (b === a) continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < maxDist) { best = b; break; }
      }
      if (!best) return;
      packets.push({
        fx: a.x, fy: a.y,
        tx: best.x, ty: best.y,
        t: 0,
        duration: 0.55 + Math.random() * 0.7,
        hue: Math.random() < 0.6 ? "orange" : "violet",
      });
    }

    function draw(now: number) {
      if (!canvas || !ctx) return;
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const r = rect();

      // Soft frame fade — leaves trails so the field feels alive
      ctx.fillStyle = "rgba(9, 9, 11, 0.32)";
      ctx.fillRect(0, 0, r.width, r.height);

      // Move nodes (wrap edges)
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < -10) n.x = r.width + 10;
        if (n.x > r.width + 10) n.x = -10;
        if (n.y < -10) n.y = r.height + 10;
        if (n.y > r.height + 10) n.y = -10;
      }

      // Glowing nodes
      for (const n of nodes) {
        const isOrange = n.color === "orange";
        const color = isOrange ? "rgb(249, 115, 22)" : "rgb(167, 139, 250)";
        ctx.shadowBlur = 16;
        ctx.shadowColor = color;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      // Packets
      for (let i = packets.length - 1; i >= 0; i--) {
        const p = packets[i];
        p.t += dt / p.duration;
        if (p.t >= 1) { packets.splice(i, 1); continue; }
        const tail = 0.2;
        const t1 = p.t;
        const t0 = Math.max(0, p.t - tail);
        const x1 = p.fx + (p.tx - p.fx) * t1;
        const y1 = p.fy + (p.ty - p.fy) * t1;
        const x0 = p.fx + (p.tx - p.fx) * t0;
        const y0 = p.fy + (p.ty - p.fy) * t0;
        const tailColor = p.hue === "orange"
          ? "rgba(249, 115, 22, 0.95)"
          : "rgba(167, 139, 250, 0.95)";
        const grad = ctx.createLinearGradient(x0, y0, x1, y1);
        grad.addColorStop(0, p.hue === "orange" ? "rgba(249, 115, 22, 0)" : "rgba(167, 139, 250, 0)");
        grad.addColorStop(1, tailColor);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();

        ctx.shadowBlur = 18;
        ctx.shadowColor = tailColor;
        ctx.fillStyle = p.hue === "orange" ? "rgba(255, 220, 180, 1)" : "rgba(230, 220, 255, 1)";
        ctx.beginPath();
        ctx.arc(x1, y1, 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      if (!reduceMotion && now - lastPacketAt > PACKET_INTERVAL_MS) {
        spawnPacket();
        lastPacketAt = now;
      }

      raf = requestAnimationFrame(draw);
    }

    resize();
    spawnNodes();
    const ro = new ResizeObserver(() => { resize(); spawnNodes(); });
    ro.observe(canvas);

    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  );
}
