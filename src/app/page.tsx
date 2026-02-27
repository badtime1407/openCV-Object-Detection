"use client";

import { useEffect, useRef, useState } from "react";
import * as ort from "onnxruntime-web";

const COCO_CLASSES = [
  "person","bicycle","car","motorcycle","airplane","bus","train","truck","boat",
  "traffic light","fire hydrant","stop sign","parking meter","bench","bird","cat","dog","horse","sheep","cow",
  "elephant","bear","zebra","giraffe","backpack","umbrella","handbag","tie","suitcase","frisbee",
  "skis","snowboard","sports ball","kite","baseball bat","baseball glove","skateboard","surfboard","tennis racket",
  "bottle","wine glass","cup","fork","knife","spoon","bowl","banana","apple","sandwich",
  "orange","broccoli","carrot","hot dog","pizza","donut","cake","chair","couch","potted plant",
  "bed","dining table","toilet","tv","laptop","mouse","remote","keyboard","cell phone",
  "microwave","oven","toaster","sink","refrigerator","book","clock","vase","scissors","teddy bear","hair drier","toothbrush"
];

export default function Home() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sessionRef = useRef<ort.InferenceSession | null>(null);

  const isRunningRef = useRef(false);
  const animationRef = useRef<number | null>(null);

  const [status, setStatus] = useState("Loading model...");
  const [fps, setFps] = useState(0);
  const [objectCount, setObjectCount] = useState(0);

  async function loadModel() {
    sessionRef.current = await ort.InferenceSession.create(
      "/models/yolov8n.onnx",
      { executionProviders: ["wasm"] }
    );
    setStatus("Model ready");
  }

  async function startCamera() {
    if (isRunningRef.current) return;

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    if (!videoRef.current) return;

    videoRef.current.srcObject = stream;
    await videoRef.current.play();

    isRunningRef.current = true;
    animationRef.current = requestAnimationFrame(loop);
  }

  function stopCamera() {
    isRunningRef.current = false;

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    const video = videoRef.current;
    if (video && video.srcObject) {
      const stream = video.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    }

    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }

    setObjectCount(0);
  }

  function preprocess(canvas: HTMLCanvasElement) {
    const size = 640;
    const tmp = document.createElement("canvas");
    tmp.width = size;
    tmp.height = size;
    const ctx = tmp.getContext("2d")!;
    ctx.drawImage(canvas, 0, 0, size, size);

    const img = ctx.getImageData(0, 0, size, size).data;
    const input = new Float32Array(1 * 3 * size * size);

    let idx = 0;
    for (let c = 0; c < 3; c++) {
      for (let i = 0; i < size * size; i++) {
        input[idx++] = img[i * 4 + c] / 255.0;
      }
    }

    return new ort.Tensor("float32", input, [1, 3, size, size]);
  }

  function iou(boxA: number[], boxB: number[]) {
    const [x1, y1, x2, y2] = boxA;
    const [x1b, y1b, x2b, y2b] = boxB;

    const interArea =
      Math.max(0, Math.min(x2, x2b) - Math.max(x1, x1b)) *
      Math.max(0, Math.min(y2, y2b) - Math.max(y1, y1b));

    const boxAArea = (x2 - x1) * (y2 - y1);
    const boxBArea = (x2b - x1b) * (y2b - y1b);

    return interArea / (boxAArea + boxBArea - interArea);
  }

  function nms(boxes: any[], threshold = 0.5) {
    boxes.sort((a, b) => b.score - a.score);
    const selected: any[] = [];

    while (boxes.length > 0) {
      const chosen = boxes.shift();
      selected.push(chosen);
      boxes = boxes.filter(
        (box) => iou(chosen.box, box.box) < threshold
      );
    }
    return selected;
  }

  async function loop() {
    if (!isRunningRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const session = sessionRef.current;

    if (!video || !canvas || !session) {
      animationRef.current = requestAnimationFrame(loop);
      return;
    }

    const ctx = canvas.getContext("2d")!;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    const inputTensor = preprocess(canvas);
    const feeds: any = {};
    feeds[session.inputNames[0]] = inputTensor;

    const start = performance.now();
    const output = await session.run(feeds);
    const end = performance.now();
    setFps(Math.round(1000 / (end - start)));

    const outTensor = output[session.outputNames[0]];
    const out = outTensor.data as Float32Array;
    const [, channels, numPred] = outTensor.dims;

    const boxes = [];
    const scaleX = canvas.width / 640;
    const scaleY = canvas.height / 640;

    for (let i = 0; i < numPred; i++) {
      const cx = out[0 * numPred + i];
      const cy = out[1 * numPred + i];
      const w  = out[2 * numPred + i];
      const h  = out[3 * numPred + i];

      let maxScore = 0;
      let classId = 0;

      for (let c = 4; c < channels; c++) {
        const score = out[c * numPred + i];
        if (score > maxScore) {
          maxScore = score;
          classId = c - 4;
        }
      }

      if (maxScore > 0.5) {
        const x1 = (cx - w / 2) * scaleX;
        const y1 = (cy - h / 2) * scaleY;
        const x2 = (cx + w / 2) * scaleX;
        const y2 = (cy + h / 2) * scaleY;

        boxes.push({ box: [x1, y1, x2, y2], score: maxScore, classId });
      }
    }

    const finalBoxes = nms(boxes, 0.5).slice(0, 2);
    setObjectCount(finalBoxes.length);

    finalBoxes.forEach((b) => {
      const [x1, y1, x2, y2] = b.box;
      ctx.strokeStyle = "#00FF00";
      ctx.lineWidth = 2;
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

      ctx.fillStyle = "black";
      ctx.fillRect(x1, y1 - 22, 220, 22);

      ctx.fillStyle = "white";
      ctx.font = "16px Arial";
      ctx.fillText(
        `${COCO_CLASSES[b.classId]} ${(b.score * 100).toFixed(1)}%`,
        x1 + 6,
        y1 - 6
      );
    });

    animationRef.current = requestAnimationFrame(loop);
  }

  useEffect(() => {
    loadModel();
  }, []);

  return (
    <main className="min-h-screen bg-gray-500 text-white p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">
          YOLOv8 Object Detection (COCO)
        </h1>

        <div>
          <button
            onClick={startCamera}
            className="px-5 py-2 bg-white text-black rounded-lg"
          >
            Start Camera
          </button>

          <button
            onClick={stopCamera}
            className="px-5 py-2 bg-red-600 text-white rounded-lg ml-3"
          >
            Stop Camera
          </button>
        </div>

        <div>Status: {status}</div>
        <div>FPS: {fps}</div>
        <div>Objects detected: {objectCount}</div>

        <canvas ref={canvasRef} className="w-full border rounded-xl" />
        <video ref={videoRef} className="hidden" />
      </div>
    </main>
  );
}