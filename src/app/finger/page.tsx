"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window { Hands: any; }
}

const FINGER_NAMES = ["หัวแม่มือ", "ชี้", "กลาง", "นาง", "ก้อย"];

export default function FingerCountPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handsRef = useRef<any>(null);
  const animationRef = useRef<number | null>(null);
  const landmarksRef = useRef<any[] | null>(null);
  const handednessRef = useRef<string>("Right");
  const lastProcessTimeRef = useRef(0);
  const isProcessingRef = useRef(false);

  const PROCESS_INTERVAL = 100;

  const [status, setStatus] = useState<"idle" | "loading" | "running" | "stopped">("idle");
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [fingerCount, setFingerCount] = useState(0);
  const [fingersUp, setFingersUp] = useState<boolean[]>([false, false, false, false, false]);

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
  function countFingers(lm: any[], isRightHand: boolean): boolean[] {
    const up: boolean[] = [false, false, false, false, false];

    // หัวแม่มือ: เช็คแกน X (กลับทิศตามมือ)
    if (isRightHand) {
      up[0] = lm[4].x < lm[3].x && lm[4].x < lm[2].x;
    } else {
      up[0] = lm[4].x > lm[3].x && lm[4].x > lm[2].x;
    }

    // นิ้วชี้ถึงก้อย: เช็คแกน Y (tip ต้องสูงกว่า mcp = โคนนิ้ว)
    const tips = [8, 12, 16, 20];
    const mcps = [5,  9, 13, 17];
    tips.forEach((tip, i) => {
      up[i + 1] = lm[tip].y < lm[mcps[i]].y;
    });

    return up;
  }

  // ── วาด skeleton ───────────────────────────────────────────────
  function drawSkeleton(ctx: CanvasRenderingContext2D, lm: any[], w: number, h: number, up: boolean[]) {
    const CONNECTIONS = [
      [0,1],[1,2],[2,3],[3,4],
      [0,5],[5,6],[6,7],[7,8],
      [0,9],[9,10],[10,11],[11,12],
      [0,13],[13,14],[14,15],[15,16],
      [0,17],[17,18],[18,19],[19,20],
      [5,9],[9,13],[13,17],
    ];

    // เส้นเชื่อม
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 2;
    CONNECTIONS.forEach(([a, b]) => {
      ctx.beginPath();
      ctx.moveTo(lm[a].x * w, lm[a].y * h);
      ctx.lineTo(lm[b].x * w, lm[b].y * h);
      ctx.stroke();
    });

    // จุด landmark — สีตามนิ้ว
    const fingerGroups = [
      [1,2,3,4],
      [5,6,7,8],
      [9,10,11,12],
      [13,14,15,16],
      [17,18,19,20],
    ];
    const fingerColors = ["#FF6B6B","#FFD93D","#6BCB77","#4D96FF","#FF922B"];

    lm.forEach((pt, idx) => {
      let color = "#fff";
      fingerGroups.forEach((grp, fi) => {
        if (grp.includes(idx)) color = up[fi] ? fingerColors[fi] : "rgba(255,255,255,0.4)";
      });
      if (idx === 0) color = "#fff";

      ctx.beginPath();
      ctx.arc(pt.x * w, pt.y * h, idx === 0 ? 7 : 5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 1;
      ctx.stroke();
    });
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

    if (landmarksRef.current) {
      const isRight = handednessRef.current === "Right";
      const up = countFingers(landmarksRef.current, isRight);
      drawSkeleton(ctx, landmarksRef.current, canvas.width, canvas.height, up);

      // วาดตัวเลขกลางฝ่ามือ
      const palmX = landmarksRef.current[9].x * canvas.width;
      const palmY = landmarksRef.current[9].y * canvas.height;
      const count = up.filter(Boolean).length;
      ctx.font = "bold 48px 'Courier New'";
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillText(String(count), palmX - 13, palmY + 3);
      ctx.fillStyle = "#00FF88";
      ctx.fillText(String(count), palmX - 15, palmY);
    }

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

  // ── Start / Stop ───────────────────────────────────────────────
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
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.5,
      });
      handsRef.current.onResults((results: any) => {
        if (results.multiHandLandmarks?.[0]) {
          landmarksRef.current = results.multiHandLandmarks[0];
          handednessRef.current = results.multiHandedness?.[0]?.label ?? "Right";
          const isRight = handednessRef.current === "Right";
          const up = countFingers(results.multiHandLandmarks[0], isRight);
          setFingersUp(up);
          setFingerCount(up.filter(Boolean).length);
        } else {
          landmarksRef.current = null;
          setFingersUp([false, false, false, false, false]);
          setFingerCount(0);
        }
      });

      animationLoop();
      setStatus("running");
    } catch (e: any) {
      console.error(e);
      setStatus("idle");
    }
  }

  function stopCamera() {
    if (animationRef.current) { cancelAnimationFrame(animationRef.current); animationRef.current = null; }
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    handsRef.current = null;
    landmarksRef.current = null;
    setFingersUp([false, false, false, false, false]);
    setFingerCount(0);
    setStatus("stopped");
  }

  const fingerColors = ["#FF6B6B","#FFD93D","#6BCB77","#4D96FF","#FF922B"];
  const isRunning = status === "running";

  return (
    <main style={{ fontFamily: "'Courier New', monospace" }} className="min-h-screen bg-black text-white p-6">
      <div className="max-w-3xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-700 pb-3">
          <div>
            <h1 className="text-xl font-bold tracking-widest uppercase text-green-400">
              Finger Counter · MediaPipe
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">นับนิ้วมือ real-time</p>
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

        {/* Count display */}
        <div className="flex gap-4 items-center border border-gray-800 rounded-lg px-6 py-4 bg-gray-950">
          <span className="text-8xl font-bold text-green-400 w-24 text-center">{fingerCount}</span>
          <div className="flex flex-col gap-2 flex-1">
            {FINGER_NAMES.map((name, i) => (
              <div key={i} className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full transition-all duration-150"
                  style={{ backgroundColor: fingersUp[i] ? fingerColors[i] : "#333" }}
                />
                <span className={`text-sm transition-colors duration-150 ${fingersUp[i] ? "text-white" : "text-gray-600"}`}>
                  {name}
                </span>
                {fingersUp[i] && (
                  <span className="text-xs ml-auto" style={{ color: fingerColors[i] }}>UP</span>
                )}
              </div>
            ))}
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
      </div>
    </main>
  );
}
