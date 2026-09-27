/* ============================================================
   data.jsx — sample data (street / traffic dataset)
   ============================================================ */

// 16-color class palette (stroke at ~600 weight) — visible on both canvas bgs
const PALETTE = {
  red:"#EF4444", orange:"#F97316", amber:"#F59E0B", yellow:"#EAB308",
  lime:"#84CC16", green:"#22C55E", teal:"#14B8A6", cyan:"#06B6D4",
  sky:"#0EA5E9", blue:"#3B82F6", indigo:"#6366F1", violet:"#8B5CF6",
  purple:"#A855F7", pink:"#EC4899", rose:"#F43F5E", fuchsia:"#D946EF",
};

// Unsplash street/traffic photos. onError in the <img> falls back to a placeholder.
const PHOTOS = [
  "1449824913935-59a10b8d2000","1502920514313-52581002a659","1494522358652-f30e61a60313",
  "1486006920555-c77dcf18193c","1502489597346-dad15683d4c2","1416339306562-f3d12fefd36f",
  "1444723121867-7a241cacace9","1490806843957-31f4c9a91c65","1494522855154-9297ac14b55f",
  "1480714378408-67cf0d13bc1b","1519501025264-65ba15a82390","1477959858617-67f85cf4f1df",
];
const photoUrl = (i, w = 900) =>
  `https://images.unsplash.com/photo-${PHOTOS[i % PHOTOS.length]}?auto=format&fit=crop&w=${w}&q=70`;

// SVG placeholder (used on image load error) — striped + mono label
const placeholder = (label, w = 900, h = 600) => {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>
    <defs><pattern id='p' width='16' height='16' patternTransform='rotate(45)' patternUnits='userSpaceOnUse'>
    <rect width='16' height='16' fill='%231C1C28'/><line x1='0' y='0' x2='0' y2='16' stroke='%2324243A' stroke-width='8'/></pattern></defs>
    <rect width='100%25' height='100%25' fill='url(%23p)'/>
    <text x='50%25' y='50%25' fill='%236A6A78' font-family='monospace' font-size='18' text-anchor='middle'>${label}</text></svg>`;
  return "data:image/svg+xml," + svg.replace(/\n\s*/g, " ");
};

const CLASSES = [
  { id:"person",  name:"person",  color:PALETTE.rose },
  { id:"car",     name:"car",     color:PALETTE.blue },
  { id:"truck",   name:"truck",   color:PALETTE.amber },
  { id:"bus",     name:"bus",     color:PALETTE.green },
  { id:"bicycle", name:"bicycle", color:PALETTE.cyan },
  { id:"motorcycle", name:"motorcycle", color:PALETTE.violet },
  { id:"traffic light", name:"traffic light", color:PALETTE.orange },
  { id:"stop sign", name:"stop sign", color:PALETTE.red },
];

// boxes are normalized [x,y,w,h] in 0..1 of the image
const seedBoxes = (i) => {
  const sets = [
    [["car",.08,.52,.26,.30],["car",.40,.50,.22,.24],["person",.70,.40,.08,.34],["traffic light",.86,.18,.05,.18],["car",.60,.55,.18,.20]],
    [["person",.30,.34,.10,.44],["person",.46,.36,.09,.40],["bicycle",.28,.58,.16,.28],["car",.66,.48,.24,.26]],
    [["bus",.20,.30,.40,.42],["car",.66,.52,.22,.22],["person",.10,.46,.07,.30],["stop sign",.90,.40,.06,.12]],
    [["car",.12,.50,.30,.30],["truck",.50,.40,.34,.40],["traffic light",.04,.20,.05,.20],["person",.88,.46,.07,.30]],
    [["motorcycle",.34,.52,.22,.30],["person",.40,.34,.10,.40],["car",.66,.54,.26,.22],["car",.04,.56,.18,.18]],
  ];
  return sets[i % sets.length].map(([cls, x, y, w, h], k) => ({
    id: `b${i}_${k}`, cls, x, y, w, h,
  }));
};

const makeImages = (n) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const labeled = i % 5 !== 3; // ~80% labeled
    const boxes = labeled ? seedBoxes(i) : [];
    out.push({
      id: `img_${i}`,
      name: `street_${String(i + 1).padStart(4, "0")}.jpg`,
      url: photoUrl(i),
      thumb: photoUrl(i, 160),
      labeled,
      boxes,
      w: 1280, h: 853,
      modified: ["2m", "14m", "1h", "3h", "yesterday", "2d", "4d"][i % 7],
    });
  }
  return out;
};

const IMAGES = makeImages(48);

const PROJECTS = [
  { id:"p1", name:"Urban Traffic v3", count:480, labeled:294, fmt:"YOLO", opened:"2 minutes ago", thumbs:[0,1,2,3] },
  { id:"p2", name:"Highway Drone Set", count:1240, labeled:1240, fmt:"COCO", opened:"yesterday", thumbs:[4,5,6,7] },
  { id:"p3", name:"Parking Lot CCTV", count:860, labeled:412, fmt:"Pascal VOC", opened:"3 days ago", thumbs:[8,9,10,11] },
  { id:"p4", name:"Pedestrian Crossings", count:320, labeled:300, fmt:"YOLO", opened:"last week", thumbs:[1,4,7,9] },
  { id:"p5", name:"Night Driving", count:2100, labeled:640, fmt:"YOLO", opened:"2 weeks ago", thumbs:[2,5,8,11] },
  { id:"p6", name:"Bike Lane Audit", count:540, labeled:540, fmt:"CSV", opened:"last month", thumbs:[3,6,0,10] },
];

// dataset stats / class distribution
const CLASS_DIST = [
  { cls:"car", count:1842 }, { cls:"person", count:1130 }, { cls:"truck", count:418 },
  { cls:"bus", count:206 }, { cls:"bicycle", count:184 }, { cls:"traffic light", count:142 },
  { cls:"motorcycle", count:96 }, { cls:"stop sign", count:54 },
];

const MODEL_CLASSES = [
  "person","bicycle","car","motorcycle","airplane","bus","train","truck","boat",
  "traffic light","fire hydrant","stop sign","parking meter","bench","bird","cat","dog",
];

const TRAIN_PROFILES = [
  { id:"nano", name:"Nano · fast iterate", model:"yolov8n", epochs:60, imgsz:640 },
  { id:"small", name:"Small · balanced", model:"yolov8s", epochs:100, imgsz:640 },
  { id:"medium", name:"Medium · accuracy", model:"yolov8m", epochs:150, imgsz:1280 },
  { id:"v11n", name:"YOLO11 Nano", model:"yolo11n", epochs:80, imgsz:640 },
];

const HEALTH = [
  { sev:"danger", text:"3 images have 0 boxes" },
  { sev:"warning", text:"Class “stop sign” has only 54 instances — consider augmentation" },
  { sev:"warning", text:"12 images have boxes < 10px (likely noise)" },
  { sev:"info", text:"Average 4.2 boxes per labeled image" },
];

const SHORTCUTS = [
  { keys:["V"], label:"Pointer tool" }, { keys:["B"], label:"Box tool" },
  { keys:["N"], label:"Next image" }, { keys:["P"], label:"Previous image" },
  { keys:["Del"], label:"Delete selected" }, { keys:["⌘","Z"], label:"Undo" },
  { keys:["⌘","S"], label:"Save image" }, { keys:["⌘","K"], label:"Command palette" },
];

Object.assign(window, {
  PALETTE, CLASSES, IMAGES, PROJECTS, CLASS_DIST, MODEL_CLASSES,
  TRAIN_PROFILES, HEALTH, SHORTCUTS, photoUrl, placeholder, classColor:
  (id) => (CLASSES.find(c => c.id === id) || {}).color || "#888",
});
