from ultralytics import YOLO

# โหลดโมเดล pretrained COCO
model = YOLO("yolov8n.pt")

# export เป็น onnx
model.export(format="onnx", opset=12)