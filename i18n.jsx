/* ============================================================
   i18n.jsx — Persian (fa) translation layer + RTL
   t(k): returns FA[k] when current lang is 'fa', else the key
   (so English literals double as keys — no en map needed).
   ============================================================ */
let CURRENT_LANG = "en";
const applyLang = (l) => { CURRENT_LANG = l; };
const isRTL = () => CURRENT_LANG === "fa";

const FA = {
  // ---- nav / chrome ----
  "Annotate":"حاشیه‌نویسی", "Dataset":"دیتاست", "Train":"آموزش", "Deploy":"استقرار",
  "Search":"جستجو", "Settings":"تنظیمات", "All projects…":"همهٔ پروژه‌ها…",
  "Switch project":"تغییر پروژه", "Auto-label":"لیبل خودکار", "Classes":"کلاس‌ها",
  "Save":"ذخیره", "System analysis":"تحلیل سیستم", "Light theme":"تم روشن", "Dark theme":"تم تیره",

  // ---- common ----
  "Cancel":"انصراف", "Close":"بستن", "Export":"خروجی", "Add":"افزودن", "Delete":"حذف",
  "Back":"بازگشت", "Continue":"ادامه", "Next":"بعدی", "Skip":"رد کردن", "Save changes":"ذخیرهٔ تغییرات",
  "of":"از", "Run":"اجرا", "items":"مورد",

  // ---- status bar ----
  "CUDA ready":"CUDA آماده", "CPU ready":"CPU آماده", "classes":"کلاس", "Auto-saved":"ذخیرهٔ خودکار",
  "labeled":"لیبل‌خورده",

  // ---- file list ----
  "Search files…":"جستجوی فایل‌ها…", "All images":"همهٔ تصاویر", "Labeled":"لیبل‌خورده",
  "Unlabeled":"بدون لیبل", "all":"همه", "labeled ":"لیبل‌خورده", "unlabeled":"بدون لیبل",
  "images":"تصویر", "boxes":"باکس", "Add images":"افزودن تصاویر",
  "No images in this project":"تصویری در این پروژه نیست",
  "Drop a folder of images here, or add them from disk to start labeling.":"یک پوشه از تصاویر را اینجا رها کنید یا از دیسک اضافه کنید تا لیبل‌گذاری شروع شود.",

  // ---- tools ----
  "Pointer":"اشاره‌گر", "Box":"باکس", "Zoom in":"بزرگ‌نمایی", "Zoom out":"کوچک‌نمایی",
  "Fit":"اندازهٔ مناسب", "Toggle inspector":"نمایش/پنهان بازرس",

  // ---- inspector ----
  "Selected box":"باکس انتخاب‌شده", "Class":"کلاس", "Annotations":"حاشیه‌نویسی‌ها",
  "Quick help":"راهنمای سریع", "Delete box":"حذف باکس",
  "No box selected. Click a box on the canvas, or draw one with the box tool.":"باکسی انتخاب نشده. روی یک باکس کلیک کنید یا با ابزار باکس یکی بکشید.",
  "No annotations yet.":"هنوز حاشیه‌نویسی‌ای نیست.",
  "Pointer tool":"ابزار اشاره‌گر", "Box tool":"ابزار باکس", "Next image":"تصویر بعدی",
  "Previous image":"تصویر قبلی", "Delete selected":"حذف انتخاب‌شده", "Undo":"بازگردانی",
  "Save image":"ذخیرهٔ تصویر", "Command palette":"پنل دستورها",

  // ---- onboarding ----
  "Label images fast":"تصاویر را سریع لیبل بزنید",
  "A keyboard-first desktop tool for drawing bounding boxes and exporting clean YOLO datasets — built for speed.":"یک ابزار دسکتاپ کیبورد-محور برای کشیدن باکس و خروجی گرفتن دیتاست تمیز YOLO — ساخته‌شده برای سرعت.",
  "Let YOLO do the first pass":"بگذارید YOLO پاس اول را بزند",
  "Auto-label hundreds of images with a pretrained model, then just review and correct. Minutes, not hours.":"صدها تصویر را با یک مدل از پیش‌آموزش‌دیده خودکار لیبل بزنید، سپس فقط بازبینی و اصلاح کنید. در عرض دقیقه، نه ساعت.",
  "Train-ready in one click":"آمادهٔ آموزش با یک کلیک",
  "Split, configure, and export a reproducible bundle with dataset.yaml and a starter script. Drop it straight into Ultralytics.":"تقسیم، پیکربندی و خروجی یک بستهٔ قابل‌بازتولید همراه با dataset.yaml و اسکریپت شروع. مستقیم در Ultralytics بگذارید.",
  "Point at a folder of images":"به یک پوشه از تصاویر اشاره کنید",
  "Drop an image folder here":"یک پوشهٔ تصاویر را اینجا رها کنید",
  "JPG, PNG, WebP · or browse to select":"JPG، PNG، WebP · یا برای انتخاب مرور کنید",
  "Browse folders":"مرور پوشه‌ها", "Open sample project":"باز کردن پروژهٔ نمونه",
  "Get started":"شروع کنید", "Step 4 of 4":"مرحلهٔ ۴ از ۴",

  // ---- project manager ----
  "Projects":"پروژه‌ها", "New project":"پروژهٔ جدید", "Search projects…":"جستجوی پروژه‌ها…",
  "Start from a folder of images":"از یک پوشهٔ تصاویر شروع کنید",

  // ---- dataset ----
  "Dataset overview":"نمای کلی دیتاست", "Export all":"خروجی همه", "Total images":"کل تصاویر",
  "Class distribution":"توزیع کلاس‌ها", "instances":"نمونه", "Dataset health":"سلامت دیتاست",
  "Image preview":"پیش‌نمایش تصویر", "Open in Annotate":"باز کردن در حاشیه‌نویسی",
  "Filter & query":"فیلتر و جستجو", "By class":"بر اساس کلاس", "Status":"وضعیت",
  "Saved presets":"پیش‌تنظیم‌های ذخیره‌شده", "Filename":"نام فایل", "Modified":"تغییر",
  "Has annotations":"دارای حاشیه‌نویسی", "Reviewed":"بازبینی‌شده", "Flagged":"نشان‌دار",
  "Sparse classes":"کلاس‌های کم‌داده", "Tiny boxes":"باکس‌های ریز", "Recently added":"اخیراً اضافه‌شده",
  "empty":"خالی",

  // ---- train ----
  "Export training bundle":"خروجی بستهٔ آموزش", "Training profiles":"پروفایل‌های آموزش",
  "Source dataset":"دیتاست مبدأ", "Train / Val / Test split":"تقسیم آموزش / اعتبارسنجی / آزمون",
  "Random seed":"سید تصادفی", "Image size":"اندازهٔ تصویر", "Epochs":"دوره‌ها (Epoch)",
  "Batch size":"اندازهٔ بچ", "Help":"راهنما", "Resulting split":"نتیجهٔ تقسیم",
  "Copy images to output folders":"کپی تصاویر به پوشه‌های خروجی",
  "Generate dataset.yaml":"ساخت dataset.yaml", "Generate train.py starter":"ساخت اسکریپت train.py",
  "CLI command":"دستور CLI", "ratios must sum to 1.0":"مجموع نسبت‌ها باید ۱.۰ شود",

  // ---- deploy ----
  "Deploy & bundle":"استقرار و بسته‌بندی", "Past exports":"خروجی‌های قبلی",
  "Pick contents":"انتخاب محتوا", "Choose format":"انتخاب قالب", "Output path":"مسیر خروجی",
  "Review":"بازبینی", "Generate bundle":"ساخت بسته", "How to use this bundle":"نحوهٔ استفاده از این بسته",
  "Contents":"محتوا", "Format":"قالب", "Est. size":"حجم تقریبی",

  // ---- auto-label ----
  "Auto-label with YOLO":"لیبل خودکار با YOLO", "Confidence":"اطمینان (Confidence)",
  "IoU threshold":"آستانهٔ IoU", "Scope":"محدوده", "Current image":"تصویر فعلی",
  "Detect classes":"کلاس‌های تشخیص", "Filter classes…":"فیلتر کلاس‌ها…",
  "Run auto-label":"اجرای لیبل خودکار",
  "Lower catches more objects but adds false positives.":"مقدار کمتر اشیای بیشتری می‌گیرد اما خطای مثبت کاذب بیشتر می‌شود.",
  "Higher keeps overlapping boxes; lower merges them.":"مقدار بالاتر باکس‌های هم‌پوشان را نگه می‌دارد؛ کمتر آن‌ها را ادغام می‌کند.",
  "Add detected classes to project":"افزودن کلاس‌های تشخیص‌داده‌شده به پروژه",
  "Auto-extend the class list":"گسترش خودکار فهرست کلاس‌ها",

  // ---- split / class manager ----
  "Train / Val / Test split":"تقسیم آموزش / اعتبارسنجی / آزمون",
  "Export split":"خروجی تقسیم", "Output":"خروجی", "Copy images to split folders":"کپی تصاویر به پوشه‌های تقسیم",
  "drag to reorder":"برای مرتب‌سازی بکشید", "Add class":"افزودن کلاس",

  // ---- settings ----
  "Appearance":"ظاهر", "Theme":"تم", "Dark":"تیره", "Light":"روشن", "Density":"تراکم",
  "Compact":"فشرده", "Cozy":"معمولی", "Roomy":"گسترده",
  "Affects spacing & row heights":"بر فاصله‌ها و ارتفاع ردیف‌ها اثر می‌گذارد",
  "Project":"پروژه", "Output format":"قالب خروجی", "Per-project annotation format":"قالب حاشیه‌نویسی هر پروژه",
  "Output directory":"پوشهٔ خروجی", "Inference":"استنتاج", "Device":"دستگاه",
  "YOLO compute target":"هدف محاسباتی YOLO", "Auto-save debounce":"تأخیر ذخیرهٔ خودکار",
  "Delay before writing":"تأخیر پیش از نوشتن", "Language":"زبان",

  // ---- command palette groups + labels ----
  "Tools":"ابزارها", "Navigate":"پیمایش", "Actions":"اقدامات", "Files":"فایل‌ها",
  "Search commands, files, actions…":"جستجوی دستورها، فایل‌ها، اقدامات…", "No results":"نتیجه‌ای نیست",
  "Go to Annotate":"رفتن به حاشیه‌نویسی", "Go to Dataset":"رفتن به دیتاست",
  "Go to Train":"رفتن به آموزش", "Go to Deploy":"رفتن به استقرار",
  "Split train / val / test":"تقسیم آموزش / اعتبارسنجی / آزمون", "Manage classes":"مدیریت کلاس‌ها",
  "Export dataset":"خروجی دیتاست", "Save current image":"ذخیرهٔ تصویر فعلی",
  "Cycle density":"چرخش تراکم", "Open settings":"باز کردن تنظیمات", "Switch project…":"تغییر پروژه…",
  "Open system analysis":"باز کردن تحلیل سیستم", "Switch language":"تغییر زبان",

  // ---- system analysis ----
  "System analysis":"تحلیل سیستم", "Re-scan":"اسکن مجدد", "Scan complete":"اسکن کامل شد",
  "CUDA available":"CUDA در دسترس", "Ready for GPU training":"آمادهٔ آموزش روی GPU",
  "Graphics (GPU)":"کارت گرافیک (GPU)", "VRAM usage":"مصرف VRAM", "Memory (RAM)":"حافظه (RAM)",
  "Processor (CPU)":"پردازنده (CPU)", "GPU utilization":"بهره‌وری GPU", "CPU utilization":"بهره‌وری CPU",
  "Storage":"فضای ذخیره‌سازی", "Environment":"محیط", "used":"استفاده‌شده", "free":"آزاد",
  "cores":"هسته", "threads":"رشته", "Driver":"درایور", "Live":"زنده",
  "Everything checks out — your machine can train YOLO models on the GPU.":"همه‌چیز سالم است — دستگاه شما می‌تواند مدل‌های YOLO را روی GPU آموزش دهد.",
};

const t = (k) => (CURRENT_LANG === "fa" && FA[k] != null) ? FA[k] : k;

Object.assign(window, { t, applyLang, isRTL });
