YOLOv8 Real-Time Object Detection (Final Project)
📌 Overview

โปรเจกต์นี้เป็นระบบ Real-Time Object Detection
ที่พัฒนาด้วย YOLOv8 และรันผ่าน ONNX Runtime Web บน Browser

ระบบสามารถตรวจจับวัตถุจากกล้องเว็บแคมแบบเรียลไทม์
พร้อมแสดง Bounding Box, Class Name และ Confidence Score

🎯 Objective

ศึกษาและประยุกต์ใช้ Deep Learning ในงาน Computer Vision
เข้าใจหลักการ Object Detection
ทำงานกับ ONNX Runtime บน WebAssembly
แสดงผลแบบ Real-time ผ่าน Web Browser

🧠 AI Model

Model: YOLOv8n
Dataset: COCO Dataset (80 classes)
Framework: Ultralytics YOLO
Export Format: ONNX
Runtime: onnxruntime-web (WASM)

⚙️ System Workflow

เปิดกล้องเว็บแคม
Capture frame แบบ real-time
Resize ภาพเป็น 640x640
ส่งเข้า YOLOv8 ONNX model
Decode output tensor
Apply Non-Maximum Suppression (NMS)
แสดง Bounding Box + Confidence

🖥️ Technologies Used

Next.js (React)
TypeScript
ONNX Runtime Web
YOLOv8
Tailwind CSS

📦 Installation

npm install
npm run dev

เปิดที่: http://localhost:3000

▶️ Usage

กดปุ่ม Start Camera
ระบบจะเริ่มตรวจจับวัตถุแบบเรียลไทม์
กด Stop Camera เพื่อหยุดการทำงาน

📊 Features

Real-time Object Detection
COCO 80 Classes
Non-Maximum Suppression (NMS)
Bounding Box Visualization
Confidence Score Display
FPS Counter
Start / Stop Camera Control

จำกัดจำนวน Bounding Box สูงสุด 2 รายการ

⚠️ Limitations

ใช้ Pre-trained Model (ไม่ได้เทรนใหม่)

ความแม่นยำขึ้นกับแสงและมุมกล้อง

YOLOv8n เป็นโมเดลขนาดเล็ก (เน้นความเร็ว)

🔬 Future Improvements

ใช้ YOLOv8s หรือ YOLOv8m เพื่อเพิ่มความแม่นยำ

Train Custom Dataset

เพิ่ม Class Filter

เพิ่ม Dashboard วิเคราะห์สถิติ