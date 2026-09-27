// Class palette + small lookup tables used by UI panels.
// All sample/demo projects and stock images have been removed —
// the app starts empty and the user loads a real folder.

import type { ClassDef } from "./types";

export const PALETTE: Record<string, string> = {
  red: "#EF4444", orange: "#F97316", amber: "#F59E0B", yellow: "#EAB308",
  lime: "#84CC16", green: "#22C55E", teal: "#14B8A6", cyan: "#06B6D4",
  sky: "#0EA5E9", blue: "#3B82F6", indigo: "#6366F1", violet: "#8B5CF6",
  purple: "#A855F7", pink: "#EC4899", rose: "#F43F5E", fuchsia: "#D946EF",
};

// SVG placeholder used as a fallback when an image fails to load.
export function placeholder(label: string, w = 900, h = 600): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>
    <defs><pattern id='p' width='16' height='16' patternTransform='rotate(45)' patternUnits='userSpaceOnUse'>
    <rect width='16' height='16' fill='%231C1C28'/><line x1='0' y='0' x2='0' y2='16' stroke='%2324243A' stroke-width='8'/></pattern></defs>
    <rect width='100%25' height='100%25' fill='url(%23p)'/>
    <text x='50%25' y='50%25' fill='%236A6A78' font-family='monospace' font-size='18' text-anchor='middle'>${label}</text></svg>`;
  return "data:image/svg+xml," + svg.replace(/\n\s*/g, " ");
}

// Default starter class list given to a brand-new project.
export const DEFAULT_CLASSES: ClassDef[] = [
  { id: "person", name: "person", color: PALETTE.rose },
  { id: "car", name: "car", color: PALETTE.blue },
  { id: "truck", name: "truck", color: PALETTE.amber },
  { id: "bus", name: "bus", color: PALETTE.green },
];

// COCO class names — used by the Auto-Label modal to let the user pick which
// classes a pretrained YOLO model should keep. These are the classes the model
// can produce; the actual filter is enforced inside the Python sidecar.
export const COCO_CLASSES = [
  "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck",
  "boat", "traffic light", "fire hydrant", "stop sign", "parking meter", "bench",
  "bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra",
  "giraffe", "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee",
  "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove",
  "skateboard", "surfboard", "tennis racket", "bottle", "wine glass", "cup",
  "fork", "knife", "spoon", "bowl", "banana", "apple", "sandwich", "orange",
  "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch",
  "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse",
  "remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink",
  "refrigerator", "book", "clock", "vase", "scissors", "teddy bear",
  "hair drier", "toothbrush",
];

// Training profile templates shown in the Train tab sidebar.
export const TRAIN_PROFILES = [
  { id: "nano", name: "Nano · fast iterate", model: "yolov8n", epochs: 60, imgsz: 640 },
  { id: "small", name: "Small · balanced", model: "yolov8s", epochs: 100, imgsz: 640 },
  { id: "medium", name: "Medium · accuracy", model: "yolov8m", epochs: 150, imgsz: 1280 },
  { id: "v11n", name: "YOLO11 Nano", model: "yolo11n", epochs: 80, imgsz: 640 },
];

export const SHORTCUTS = [
  { keys: ["V"], label: "Pointer tool" }, { keys: ["B"], label: "Box tool" },
  { keys: ["N"], label: "Next image" }, { keys: ["P"], label: "Previous image" },
  { keys: ["Del"], label: "Delete selected" }, { keys: ["⌘", "Z"], label: "Undo" },
  { keys: ["⌘", "S"], label: "Save image" }, { keys: ["⌘", "K"], label: "Command palette" },
];

export const classColor = (id: string, classes: ClassDef[] = DEFAULT_CLASSES): string =>
  (classes.find(c => c.id === id) || { color: "#888" }).color;
