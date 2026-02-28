"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window { Hands: any; }
}

const FINGER_NAMES = ["หัวแม่มือ", "ชี้", "กลาง", "นาง", "ก้อย"];
const FINGER_COLORS = ["#FF6B6B", "#FFD93D", "#6BCB77", "#4D96FF", "#FF922B"];
const HAND_COLORS = { right: "#00FF88", left: "#FF6BFF" };

export default function FingerCountPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handsRef = useRef<any>(null);
  const animationRef = useRef<number | null>(null);
  const handsDataRef = useRef<{ lm: any[]; isRight: boolean }[]>([]);
  const lastProcessTimeRef = useRef(0);
  const isProcessingRef = useRef(false);

  const PROCESS_INTERVAL = 100;

  const [status, setStatus] = useState<"idle" | "loading" | "running" | "stopped">("idle");
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [handsInfo, setHandsInfo] = useState<{ isRight: boolean; up: boolean[]; count: number }[]>([]);

  // ── โหลด MediaPipe CDN ─────────────────────────────────────────
  useEffect(() => {
    if (document.getElementById("mp-hands")) { setScriptLoaded(true); return; }
    const s = document.createElement("script");
    s.id = "mp-hands";
    s.src = "https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js";
    s.crossOrigin = "anonymous";
    s.onload = () => setScriptLoaded(true);
    document.head.appendChild(s);
    return () => stopCamera();
  }, []);

  // ── นับนิ้ว ────────────────────────────────────────────────────
  function countFingers(lm: any[], isRight: boolean): boolean[] {
    const up: boolean[] = [false, false, false, false, false];

    // หัวแม่มือ: แกน X
    up[0] = isRight
      ? lm[4].x < lm[3].x && lm[4].x < lm[2].x
      : lm[4].x > lm[3].x && lm[4].x > lm[2].x;

    // นิ้วชี้–ก้อย: tip สูงกว่า mcp
    const tips = [8, 12, 16, 20];
    const mcps = [5,  9, 13, 17];
    tips.forEach((tip, i) => {
      up[i + 1] = lm[tip].y < lm[mcps[i]].y;
    });

    return up;
  }

  // ── วาด skeleton ───────────────────────────────────────────────
  function drawSkeleton(
    ctx: CanvasRenderingContext2D,
    lm: any[],
    w: number,
    h: number,
    up: boolean[],
    isRight: boolean
  ) {
    const CONNECTIONS = [
      [0,1],[1,2],[2,3],[3,4],
      [0,5],[5,6],[6,7],[7,8],
      [0,9],[9,10],[10,11],[11,12],
      [0,13],[13,14],[14,15],[15,16],
      [0,17],[17,18],[18,19],[19,20],
      [5,9],[9,13],[13,17],
    ];

    const baseColor = isRight ? HAND_COLORS.right : HAND_COLORS.left;

    // เส้นเชื่อม
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 2;
    CONNECTIONS.forEach(([a, b]) => {
      ctx.beginPath();
      ctx.moveTo(lm[a].x * w, lm[a].y * h);
      ctx.lineTo(lm[b].x * w, lm[b].y * h);
      ctx.stroke();
    });

    // จุด landmark
    const fingerGroups = [
      [1,2,3,4],
      [5,6,7,8],
      [9,10,11,12],
      [13,14,15,16],
      [17,18,19,20],
    ];

    lm.forEach((pt, idx) => {
      let color = "rgba(255,255,255,0.4)";
      if (idx === 0) {
        color = baseColor;
      } else {
        fingerGroups.forEach((grp, fi) => {
          if (grp.includes(idx)) {
            color = up[fi] ? FINGER_COLORS[fi] : "rgba(255,255,255,0.3)";
          }
        });
      }

      ctx.beginPath();
      ctx.arc(pt.x * w, pt.y * h, idx === 0 ? 7 : 5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // วาดเลขบนฝ่ามือ
    const palmX = lm[9].x * w;
    const palmY = lm[9].y * h;
    const count = up.filter(Boolean).length;
    ctx.font = "bold 52px 'Courier New'";
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillText(String(count), palmX - 13, palmY + 3);
    ctx.fillStyle = baseColor;
    ctx.fillText(String(count), palmX - 15, palmY);

    // label มือซ้าย/ขวา
    const wristX = lm[0].x * w;
    const wristY = lm[0].y * h;
    ctx.font = "bold 13px 'Courier New'";
    ctx.fillStyle = baseColor;
    ctx.fillText(isRight ? "RIGHT" : "LEFT", wristX - 20, wristY + 20);
  }

  // ── Animation loop ─────────────────────────────────────────────
  function animationLoop() {
    animationRef.current = requestAnimationFrame(animationLoop);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;

    if (canvas.width !== video.videoWidth && video.videoWidth > 0) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    handsDataRef.current.forEach(({ lm, isRight }) => {
      const up = countFingers(lm, isRight);
      drawSkeleton(ctx, lm, canvas.width, canvas.height, up, isRight);
    });

    if (!handsRef.current || isProcessingRef.current) return;
    const now = performance.now();
    if (now - lastProcessTimeRef.current < PROCESS_INTERVAL) return;
    lastProcessTimeRef.current = now;
    isProcessingRef.current = true;
    handsRef.current
      .send({ image: video })
      .catch(console.error)
      .finally(() => { isProcessingRef.current = false; });
  }

  // ── Start camera ───────────────────────────────────────────────
  async function startCamera() {
    if (!scriptLoaded || !window.Hands || !videoRef.current) return;
    try {
      setStatus("loading");
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoRef.current.srcObject = stream;
      await new Promise<void>((res) => { videoRef.current!.onloadedmetadata = () => res(); });
      await videoRef.current.play();

      handsRef.current = new window.Hands({
        locateFile: (f: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
      });
      handsRef.current.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.5,
      });

      handsRef.current.onResults((results: any) => {
        if (results.multiHandLandmarks?.length) {
          // เก็บข้อมูลทุกมือ
          handsDataRef.current = results.multiHandLandmarks.map((lm: any, i: number) => ({
            lm,
            isRight: results.multiHandedness?.[i]?.label === "Right",
          }));

          // คำนวณ state สำหรับ UI
          const info = handsDataRef.current.map(({ lm, isRight }) => {
            const up = countFingers(lm, isRight);
            return { isRight, up, count: up.filter(Boolean).length };
          });
          setHandsInfo(info);
          setTotalCount(info.reduce((sum, h) => sum + h.count, 0));
        } else {
          handsDataRef.current = [];
          setHandsInfo([]);
          setTotalCount(0);
        }
      });

      animationLoop();
      setStatus("running");
    } catch (e: any) {
      console.error(e);
      setStatus("idle");
    }
  }

  // ── Stop camera ────────────────────────────────────────────────
  function stopCamera() {
    if (animationRef.current) { cancelAnimationFrame(animationRef.current); animationRef.current = null; }
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    handsRef.current = null;
    handsDataRef.current = [];
    setHandsInfo([]);
    setTotalCount(0);
    setStatus("stopped");
  }

  const isRunning = status === "running";

  return (
    <main style={{ fontFamily: "'Courier New', monospace" }} className="min-h-screen bg-black text-white p-6">
      <div className="max-w-3xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-700 pb-3">
          <div>
            <h1 className="text-xl font-bold tracking-widest uppercase text-green-400">
              Finger Counter · 2 Hands
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">นับนิ้วสองมือ real-time · MediaPipe</p>
          </div>
          <div className="flex gap-2 items-center text-xs">
            <span className={`w-2 h-2 rounded-full ${
              isRunning ? "bg-green-400 animate-pulse" :
              status === "loading" ? "bg-yellow-400 animate-pulse" : "bg-gray-600"
            }`} />
            <span className="uppercase tracking-widest text-gray-400">{status}</span>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button onClick={startCamera} disabled={isRunning || !scriptLoaded}
            className="px-5 py-2 bg-green-400 text-black font-bold text-sm tracking-widest uppercase rounded disabled:opacity-40 hover:bg-green-300 transition-colors">
            ▶ Start
          </button>
          <button onClick={stopCamera} disabled={!isRunning}
            className="px-5 py-2 bg-red-500 text-white font-bold text-sm tracking-widest uppercase rounded disabled:opacity-40 hover:bg-red-400 transition-colors">
            ■ Stop
          </button>
          {!scriptLoaded && <span className="text-xs text-yellow-400 self-center animate-pulse">โหลด MediaPipe…</span>}
        </div>

        {/* Total count */}
        <div className="border border-gray-800 rounded-lg px-6 py-4 bg-gray-950 flex items-center gap-6">
          <div className="text-center">
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">รวม</p>
            <span className="text-8xl font-bold text-green-400">{totalCount}</span>
          </div>

          {/* แสดงแต่ละมือ */}
          <div className="flex gap-4 flex-1">
            {[
              { label: "RIGHT", color: HAND_COLORS.right },
              { label: "LEFT",  color: HAND_COLORS.left  },
            ].map(({ label, color }) => {
              const hand = handsInfo.find((h) => (label === "RIGHT") === h.isRight);
              return (
                <div key={label} className="flex-1 border border-gray-800 rounded-lg p-3 bg-black">
                  <p className="text-xs font-bold mb-2" style={{ color }}>{label}</p>
                  <p className="text-4xl font-bold mb-2" style={{ color }}>
                    {hand ? hand.count : "—"}
                  </p>
                  <div className="space-y-1">
                    {FINGER_NAMES.map((name, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full transition-all duration-100"
                          style={{ backgroundColor: hand?.up[i] ? FINGER_COLORS[i] : "#333" }}
                        />
                        <span className={`text-xs transition-colors duration-100 ${hand?.up[i] ? "text-white" : "text-gray-600"}`}>
                          {name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Canvas */}
        <div className="relative border border-gray-800 rounded-lg overflow-hidden bg-gray-950">
          {!isRunning && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <span className="text-gray-600 text-sm uppercase tracking-widest">
                {status === "loading" ? "กำลังเริ่ม…" : "กล้องปิด"}
              </span>
            </div>
          )}
          <canvas ref={canvasRef} width={640} height={480} className="w-full block" />
        </div>

        <video ref={videoRef} className="hidden" playsInline muted />

        <p className="text-xs text-gray-700 text-center">
          🟢 มือขวา &nbsp;|&nbsp; 🟣 มือซ้าย
        </p>
      </div>
    </main>
  );
}
