"use client";

import { useEffect, useRef, useState } from "react";

// ── ประกาศ type ให้ TypeScript รู้จัก window.Hands ──
declare global {
  interface Window {
    Hands: any;
  }
}

const GESTURE_EMOJI: Record<string, string> = {
  STOP: "✊",
  HELLO: "🖐️",
  PEACE: "✌️",
  OK: "👍",
  "I LOVE YOU": "🤟",
  None: "—",
};

export default function HandPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handsRef = useRef<any>(null);
  const animationRef = useRef<number | null>(null);
  const lastProcessTimeRef = useRef(0);
  const isProcessingRef = useRef(false);
  const landmarksRef = useRef<any[] | null>(null); // เก็บ landmarks ล่าสุด

  const PROCESS_INTERVAL = 150; // ~6 FPS inference

  const [status, setStatus] = useState<"idle" | "loading" | "running" | "stopped" | "error">("idle");
  const [gesture, setGesture] = useState("None");
  const [scriptLoaded, setScriptLoaded] = useState(false);

  // ── โหลด MediaPipe script จาก CDN ──────────────────────────────
  useEffect(() => {
    if (document.getElementById("mediapipe-hands-script")) {
      setScriptLoaded(true);
      return;
    }

    const script = document.createElement("script");
    script.id = "mediapipe-hands-script";
    script.src = "https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js";
    script.crossOrigin = "anonymous";
    script.onload = () => setScriptLoaded(true);
    script.onerror = () => {
      console.error("Failed to load MediaPipe script");
      setStatus("error");
    };
    document.head.appendChild(script);

    return () => stopCamera();
  }, []);

  // ── Gesture detection ───────────────────────────────────────────
  function isFingerUp(lm: any[], tip: number, pip: number) {
    return lm[tip].y < lm[pip].y;
  }

  function detectGesture(lm: any[], isRightHand: boolean) {
    const thumbUp = lm[4].y < lm[3].y;
    const indexUp = isFingerUp(lm, 8, 6);
    const middleUp = isFingerUp(lm, 12, 10);
    const ringUp = isFingerUp(lm, 16, 14);
    const pinkyUp = isFingerUp(lm, 20, 18);
    const total = [thumbUp, indexUp, middleUp, ringUp, pinkyUp].filter(Boolean).length;

    if (total === 5) return "HELLO";
    if (indexUp && middleUp && !ringUp && !pinkyUp) return "PEACE";
    if (thumbUp && !indexUp && !middleUp) return "OK";
    if (thumbUp && indexUp && !middleUp && !ringUp && pinkyUp) return "I LOVE YOU";

    // กำมือ: นิ้วทุกนิ้วพับลง + หัวแม่มือพับเข้าด้านใน
    const thumbFolded = isRightHand
      ? lm[4].x > lm[3].x && lm[4].x > lm[2].x   // มือขวา: ปลายนิ้วอยู่ขวาของข้อ
      : lm[4].x < lm[3].x && lm[4].x < lm[2].x;  // มือซ้าย: ปลายนิ้วอยู่ซ้ายของข้อ

    if (!indexUp && !middleUp && !ringUp && !pinkyUp && thumbFolded) return "STOP";

    return "None";
  }

  // ── Draw connections between landmarks ─────────────────────────
  function drawSkeleton(ctx: CanvasRenderingContext2D, lm: any[], w: number, h: number) {
    const CONNECTIONS = [
      [0,1],[1,2],[2,3],[3,4],
      [0,5],[5,6],[6,7],[7,8],
      [0,9],[9,10],[10,11],[11,12],
      [0,13],[13,14],[14,15],[15,16],
      [0,17],[17,18],[18,19],[19,20],
      [5,9],[9,13],[13,17],
    ];

    ctx.strokeStyle = "rgba(0,255,136,0.7)";
    ctx.lineWidth = 2;
    CONNECTIONS.forEach(([a, b]) => {
      ctx.beginPath();
      ctx.moveTo(lm[a].x * w, lm[a].y * h);
      ctx.lineTo(lm[b].x * w, lm[b].y * h);
      ctx.stroke();
    });

    lm.forEach((pt) => {
      ctx.beginPath();
      ctx.arc(pt.x * w, pt.y * h, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#00FF88";
      ctx.fill();
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  }

  // ── Animation loop: วาด video ทุก frame, ส่ง mediapipe ตาม interval ──
  function animationLoop() {
    animationRef.current = requestAnimationFrame(animationLoop);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;

    // sync canvas size
    if (canvas.width !== video.videoWidth && video.videoWidth > 0) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // วาด video ทุก frame เสมอ
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // วาด landmarks ล่าสุดทับ (ถ้ามี)
    if (landmarksRef.current) {
      drawSkeleton(ctx, landmarksRef.current, canvas.width, canvas.height);
    }

    // ส่งให้ MediaPipe ตาม interval
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

  // ── Start camera ────────────────────────────────────────────────
  async function startCamera() {
    if (!scriptLoaded) {
      alert("MediaPipe กำลังโหลด กรุณารอสักครู่");
      return;
    }
    if (!window.Hands) {
      alert("window.Hands ไม่พบ — โหลด script ไม่สำเร็จ");
      return;
    }
    if (!videoRef.current) return;

    try {
      setStatus("loading");

      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoRef.current.srcObject = stream;

      // รอให้ video metadata พร้อมก่อน
      await new Promise<void>((resolve) => {
        videoRef.current!.onloadedmetadata = () => resolve();
      });
      await videoRef.current.play();

      // ✅ ใช้ window.Hands จาก CDN แทน import
      handsRef.current = new window.Hands({
        locateFile: (file: string) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
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
          // MediaPipe label "Right" หมายถึงมือขวาของคนในกล้อง (ซึ่งกลับซ้าย-ขวาในภาพ)
          const label = results.multiHandedness?.[0]?.label ?? "Right";
          const isRightHand = label === "Right";
          setGesture(detectGesture(results.multiHandLandmarks[0], isRightHand));
        } else {
          landmarksRef.current = null;
          setGesture("None");
        }
      });

      animationLoop();
      setStatus("running");
    } catch (err: any) {
      console.error("Camera error:", err);
      setStatus("error");
      alert("Error: " + err?.message);
    }
  }

  // ── Stop camera ─────────────────────────────────────────────────
  function stopCamera() {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    handsRef.current = null;
    landmarksRef.current = null;
    setGesture("None");
    setStatus("stopped");
  }

  const isRunning = status === "running";

  return (
    <main
      style={{ fontFamily: "'Courier New', monospace" }}
      className="min-h-screen bg-black text-white p-6"
    >
      <div className="max-w-3xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-700 pb-3">
          <div>
            <h1 className="text-xl font-bold tracking-widest uppercase text-green-400">
              Hand Gesture · MediaPipe
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Real-time hand landmark detection via CDN
            </p>
          </div>
          <div className="flex gap-2 items-center text-xs text-gray-400">
            <span className={`w-2 h-2 rounded-full inline-block ${
              isRunning         ? "bg-green-400 animate-pulse" :
              status === "loading" ? "bg-yellow-400 animate-pulse" :
              status === "error"   ? "bg-red-500" : "bg-gray-600"
            }`} />
            <span className="uppercase tracking-widest">{status}</span>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={startCamera}
            disabled={isRunning || !scriptLoaded}
            className="px-5 py-2 bg-green-400 text-black font-bold text-sm tracking-widest uppercase rounded disabled:opacity-40 hover:bg-green-300 transition-colors"
          >
            ▶ Start
          </button>
          <button
            onClick={stopCamera}
            disabled={!isRunning}
            className="px-5 py-2 bg-red-500 text-white font-bold text-sm tracking-widest uppercase rounded disabled:opacity-40 hover:bg-red-400 transition-colors"
          >
            ■ Stop
          </button>
          {!scriptLoaded && (
            <span className="text-xs text-yellow-400 self-center animate-pulse">
              โหลด MediaPipe script…
            </span>
          )}
        </div>

        {/* Gesture display */}
        <div className="border border-gray-800 rounded-lg px-6 py-4 bg-gray-950 flex items-center gap-4">
          <span className="text-5xl">{GESTURE_EMOJI[gesture] ?? "—"}</span>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-widest">Gesture</p>
            <p className="text-3xl font-bold text-green-400">{gesture}</p>
          </div>
        </div>

        {/* Gestures guide */}
        <div className="grid grid-cols-5 gap-2 text-center text-xs text-gray-500">
          {Object.entries(GESTURE_EMOJI).filter(([k]) => k !== "None").map(([name, emoji]) => (
            <div key={name} className="border border-gray-800 rounded p-2 bg-gray-950">
              <div className="text-2xl">{emoji}</div>
              <div className="mt-1 uppercase tracking-wide">{name}</div>
            </div>
          ))}
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
