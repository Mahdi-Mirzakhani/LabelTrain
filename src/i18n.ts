import type { LangCode } from "./types";

let CURRENT_LANG: LangCode = "en";

export const applyLang = (l: LangCode): void => { CURRENT_LANG = l; };
export const isRTL = (): boolean => CURRENT_LANG === "fa";

const FA: Record<string, string> = {
  // nav / chrome
  "Annotate": "حاشیه‌نویسی", "Dataset": "دیتاست", "Train": "آموزش", "Deploy": "استقرار",
  "Search": "جستجو", "Settings": "تنظیمات", "All projects…": "همهٔ پروژه‌ها…",
  "Switch project": "تغییر پروژه", "Auto-label": "لیبل خودکار", "Classes": "کلاس‌ها",
  "Save": "ذخیره", "System analysis": "تحلیل سیستم", "Light theme": "تم روشن", "Dark theme": "تم تیره",
  // common
  "Cancel": "انصراف", "Close": "بستن", "Export": "خروجی", "Add": "افزودن", "Delete": "حذف",
  "Minimize": "کوچک کردن", "Maximize": "بزرگ کردن", "All classes": "همهٔ کلاس‌ها",
  "Nothing to undo": "چیزی برای بازگردانی نیست",
  "Back": "بازگشت", "Continue": "ادامه", "Next": "بعدی", "Skip": "رد کردن", "Save changes": "ذخیرهٔ تغییرات",
  "of": "از", "Run": "اجرا", "items": "مورد",
  // status bar
  "CUDA ready": "CUDA آماده", "CPU ready": "CPU آماده", "classes": "کلاس", "Auto-saved": "ذخیرهٔ خودکار",
  "labeled": "لیبل‌خورده",
  // auto-label progress / warnings
  "Auto-labeling…": "در حال لیبل خودکار…",
  "Auto-label cancelled": "لیبل خودکار لغو شد",
  "images skipped — could not read image size": "تصویر رد شد — ابعاد تصویر خوانده نشد",
  "Files sharing a name will overwrite each other's labels:":
    "فایل‌های هم‌نام لیبل‌های یکدیگر را بازنویسی می‌کنند:",
  "Couldn't write project settings — is the folder read-only?":
    "تنظیمات پروژه ذخیره نشد — آیا پوشه فقط‌خواندنی است؟",
  // file list
  "Search files…": "جستجوی فایل‌ها…", "All images": "همهٔ تصاویر", "Labeled": "لیبل‌خورده",
  "Unlabeled": "بدون لیبل", "all": "همه", "unlabeled": "بدون لیبل",
  "images": "تصویر", "boxes": "باکس", "Add images": "افزودن تصاویر",
  "No images in this project": "تصویری در این پروژه نیست",
  // review progress
  "Not reviewed": "بازبینی‌نشده", "reviewed": "بازبینی‌شده",   // "Reviewed" is under the dataset tab below
  "You stopped here last time": "دفعهٔ قبل اینجا متوقف شدید", "Resumed at": "ادامه از",
  "Delete image": "حذف عکس", "Delete image and its labels": "حذف عکس و لیبل‌هایش",
  "Couldn't delete": "حذف نشد:", "moved to the Recycle Bin, with its labels": "همراه لیبل‌هایش به سطل بازیافت رفت",
  "Couldn't save the review progress — is the folder read-only?":
    "پیشرفت بازبینی ذخیره نشد — آیا پوشه فقط‌خواندنی است؟",
  "Drop a folder of images here, or add them from disk to start labeling.":
    "یک پوشه از تصاویر را اینجا رها کنید یا از دیسک اضافه کنید تا لیبل‌گذاری شروع شود.",
  // tools
  "Pointer": "اشاره‌گر", "Box": "باکس", "Zoom in": "بزرگ‌نمایی", "Zoom out": "کوچک‌نمایی",
  "Fit": "اندازهٔ مناسب", "Toggle inspector": "نمایش/پنهان بازرس",
  // oriented boxes (OBB)
  "Oriented boxes (OBB)": "باکس‌های چرخان (OBB)",
  "Rotatable boxes": "باکس‌های قابل چرخش",
  "Adds a rotation knob and the angle control": "دستگیرهٔ چرخش و تنظیم زاویه را اضافه می‌کند",
  "Save as": "ذخیره به‌صورت", "Which label files each save writes": "هر ذخیره چه فایل‌هایی بنویسد",
  "Both (recommended)": "هر دو (پیشنهادی)", "YOLO OBB only": "فقط YOLO OBB",
  "Upright only": "فقط افقی",
  "Upright labels go where they always have; the rotated set lands beside them in a “…_obb” folder.":
    "لیبل‌های افقی سر جای همیشگی‌شان می‌روند؛ مجموعهٔ چرخان کنارشان در پوشهٔ «…_obb» ذخیره می‌شود.",
  "One file per image: class_index x1 y1 x2 y2 x3 y3 x4 y4, normalized. This is what “yolo obb train” reads.":
    "هر تصویر یک فایل: class_index x1 y1 x2 y2 x3 y3 x4 y4 به‌صورت نرمال‌شده. همان چیزی که «yolo obb train» می‌خواند.",
  "Angles are NOT written — each box is stored as the upright rectangle around it.":
    "زاویه‌ها نوشته نمی‌شوند — هر باکس به‌صورت مستطیل افقی دربرگیرنده‌اش ذخیره می‌شود.",
  "Angle": "زاویه", "Reset angle": "صفر کردن زاویه",
  "Q/E turn 1°, A/D turn 5°, Shift while dragging the knob snaps to 15°":
    "Q/E یک درجه، A/D پنج درجه، نگه‌داشتن Shift هنگام کشیدن دستگیره روی ۱۵ درجه می‌پرد",
  "Drag to rotate · hold Shift to snap to 15°": "برای چرخاندن بکشید · با Shift روی ۱۵ درجه می‌پرد",
  "OBB + upright": "OBB + افقی", "OBB only": "فقط OBB",
  // lossy-save warning
  "Rotation will not be saved": "چرخش ذخیره نمی‌شود",
  "You have rotated boxes, but the save style is set to “Upright only”.":
    "باکس‌های چرخانده‌شده دارید، اما سبک ذخیره روی «فقط افقی» تنظیم شده است.",
  "rotated box": "باکس چرخان", "rotated boxes": "باکس چرخان",
  "will be written to": "نوشته می‌شود در قالب",
  "as the upright rectangle around them — the angle is lost.":
    "به‌صورت مستطیل افقی دربرگیرنده — زاویه از دست می‌رود.",
  "Switch to “Both” or “YOLO OBB only” in Settings to keep the angles.":
    "برای حفظ زاویه‌ها، در تنظیمات به «هر دو» یا «فقط YOLO OBB» تغییر دهید.",
  "Continue anyway": "به‌هرحال ادامه بده",
  // inspector
  "Selected box": "باکس انتخاب‌شده", "Class": "کلاس", "Annotations": "حاشیه‌نویسی‌ها",
  "Quick help": "راهنمای سریع", "Delete box": "حذف باکس",
  "No box selected. Click a box on the canvas, or draw one with the box tool.":
    "باکسی انتخاب نشده. روی یک باکس کلیک کنید یا با ابزار باکس یکی بکشید.",
  "No annotations yet.": "هنوز حاشیه‌نویسی‌ای نیست.",
  "Pointer tool": "ابزار اشاره‌گر", "Box tool": "ابزار باکس", "Next image": "تصویر بعدی",
  "Previous image": "تصویر قبلی", "Delete selected": "حذف انتخاب‌شده", "Undo": "بازگردانی",
  "Save image": "ذخیرهٔ تصویر", "Command palette": "پنل دستورها",
  // onboarding
  "Label images fast": "تصاویر را سریع لیبل بزنید",
  "A keyboard-first desktop tool for drawing bounding boxes and exporting clean YOLO datasets — built for speed.":
    "یک ابزار دسکتاپ کیبورد-محور برای کشیدن باکس و خروجی گرفتن دیتاست تمیز YOLO — ساخته‌شده برای سرعت.",
  "Let YOLO do the first pass": "بگذارید YOLO پاس اول را بزند",
  "Auto-label hundreds of images with a pretrained model, then just review and correct. Minutes, not hours.":
    "صدها تصویر را با یک مدل از پیش‌آموزش‌دیده خودکار لیبل بزنید، سپس فقط بازبینی و اصلاح کنید. در عرض دقیقه، نه ساعت.",
  "Train-ready in one click": "آمادهٔ آموزش با یک کلیک",
  "Split, configure, and export a reproducible bundle with dataset.yaml and a starter script. Drop it straight into Ultralytics.":
    "تقسیم، پیکربندی و خروجی یک بستهٔ قابل‌بازتولید همراه با dataset.yaml و اسکریپت شروع. مستقیم در Ultralytics بگذارید.",
  "Point at a folder of images": "به یک پوشه از تصاویر اشاره کنید",
  "Drop an image folder here": "یک پوشهٔ تصاویر را اینجا رها کنید",
  "JPG, PNG, WebP · or browse to select": "JPG، PNG، WebP · یا برای انتخاب مرور کنید",
  "Browse folders": "مرور پوشه‌ها", "Open sample project": "باز کردن پروژهٔ نمونه",
  "Get started": "شروع کنید", "Step 4 of 4": "مرحلهٔ ۴ از ۴",
  // projects
  "Projects": "پروژه‌ها", "New project": "پروژهٔ جدید", "Search projects…": "جستجوی پروژه‌ها…",
  "Start from a folder of images": "از یک پوشهٔ تصاویر شروع کنید",
  // dataset
  "Dataset overview": "نمای کلی دیتاست", "Export all": "خروجی همه", "Total images": "کل تصاویر",
  "Class distribution": "توزیع کلاس‌ها", "instances": "نمونه", "Dataset health": "سلامت دیتاست",
  "Image preview": "پیش‌نمایش تصویر", "Open in Annotate": "باز کردن در حاشیه‌نویسی",
  "Filter & query": "فیلتر و جستجو", "By class": "بر اساس کلاس", "Status": "وضعیت",
  "Saved presets": "پیش‌تنظیم‌های ذخیره‌شده", "Filename": "نام فایل", "Modified": "تغییر",
  "Has annotations": "دارای حاشیه‌نویسی", "Reviewed": "بازبینی‌شده", "Flagged": "نشان‌دار",
  "Sparse classes": "کلاس‌های کم‌داده", "Tiny boxes": "باکس‌های ریز", "Recently added": "اخیراً اضافه‌شده",
  "empty": "خالی",
  // train
  "Export training bundle": "خروجی بستهٔ آموزش", "Training profiles": "پروفایل‌های آموزش",
  "Source dataset": "دیتاست مبدأ", "Train / Val / Test split": "تقسیم آموزش / اعتبارسنجی / آزمون",
  "Random seed": "سید تصادفی", "Image size": "اندازهٔ تصویر", "Epochs": "دوره‌ها (Epoch)",
  "Batch size": "اندازهٔ بچ", "Help": "راهنما", "Resulting split": "نتیجهٔ تقسیم",
  "Copy images to output folders": "کپی تصاویر به پوشه‌های خروجی",
  "Generate dataset.yaml": "ساخت dataset.yaml", "Generate train.py starter": "ساخت اسکریپت train.py",
  "CLI command": "دستور CLI", "ratios must sum to 1.0": "مجموع نسبت‌ها باید ۱.۰ شود",
  // deploy
  "Deploy & bundle": "استقرار و بسته‌بندی", "Past exports": "خروجی‌های قبلی",
  "Pick contents": "انتخاب محتوا", "Choose format": "انتخاب قالب", "Output path": "مسیر خروجی",
  "Review": "بازبینی", "Generate bundle": "ساخت بسته", "How to use this bundle": "نحوهٔ استفاده از این بسته",
  "Contents": "محتوا", "Format": "قالب", "Est. size": "حجم تقریبی",
  // auto-label
  "Auto-label with YOLO": "لیبل خودکار با YOLO", "Confidence": "اطمینان (Confidence)",
  "IoU threshold": "آستانهٔ IoU", "Scope": "محدوده", "Current image": "تصویر فعلی",
  "Detect classes": "کلاس‌های تشخیص", "Filter classes…": "فیلتر کلاس‌ها…",
  "Run auto-label": "اجرای لیبل خودکار",
  "Lower catches more objects but adds false positives.": "مقدار کمتر اشیای بیشتری می‌گیرد اما خطای مثبت کاذب بیشتر می‌شود.",
  "Higher keeps overlapping boxes; lower merges them.": "مقدار بالاتر باکس‌های هم‌پوشان را نگه می‌دارد؛ کمتر آن‌ها را ادغام می‌کند.",
  "Add detected classes to project": "افزودن کلاس‌های تشخیص‌داده‌شده به پروژه",
  "Auto-extend the class list": "گسترش خودکار فهرست کلاس‌ها",
  // split / class manager
  "Export split": "خروجی تقسیم", "Output": "خروجی", "Copy images to split folders": "کپی تصاویر به پوشه‌های تقسیم",
  "drag to reorder": "برای مرتب‌سازی بکشید", "Add class": "افزودن کلاس",
  "Import names from file…": "وارد کردن اسم‌ها از فایل…",
  "Names must be in class-index order (0 first). Editing them re-reads YOLO labels from disk.":
    "اسم‌ها باید به‌ترتیبِ شمارهٔ کلاس باشند (اول ۰). با ویرایششان، لیبل‌های YOLO دوباره از دیسک خوانده می‌شوند.",
  "Set names": "تعیین اسم‌ها",
  "Class names couldn't be detected — the labels show default names. Set them in Classes.":
    "اسم کلاس‌ها تشخیص داده نشد — لیبل‌ها با اسم‌های پیش‌فرض نمایش داده می‌شوند. آن‌ها را در بخش کلاس‌ها تعیین کنید.",
  // settings
  "Appearance": "ظاهر", "Theme": "تم", "Dark": "تیره", "Light": "روشن", "Density": "تراکم",
  "Compact": "فشرده", "Cozy": "معمولی", "Roomy": "گسترده",
  "Affects spacing & row heights": "بر فاصله‌ها و ارتفاع ردیف‌ها اثر می‌گذارد",
  "Project": "پروژه", "Output format": "قالب خروجی", "Per-project annotation format": "قالب حاشیه‌نویسی هر پروژه",
  "Output directory": "پوشهٔ خروجی", "Inference": "استنتاج", "Device": "دستگاه",
  "YOLO compute target": "هدف محاسباتی YOLO", "Auto-save debounce": "تأخیر ذخیرهٔ خودکار",
  "Delay before writing": "تأخیر پیش از نوشتن", "Language": "زبان",
  // command palette
  "Tools": "ابزارها", "Navigate": "پیمایش", "Actions": "اقدامات", "Files": "فایل‌ها",
  "Search commands, files, actions…": "جستجوی دستورها، فایل‌ها، اقدامات…", "No results": "نتیجه‌ای نیست",
  "Go to Annotate": "رفتن به حاشیه‌نویسی", "Go to Dataset": "رفتن به دیتاست",
  "Go to Train": "رفتن به آموزش", "Go to Deploy": "رفتن به استقرار",
  "Split train / val / test": "تقسیم آموزش / اعتبارسنجی / آزمون", "Manage classes": "مدیریت کلاس‌ها",
  "Export dataset": "خروجی دیتاست", "Save current image": "ذخیرهٔ تصویر فعلی",
  "Cycle density": "چرخش تراکم", "Open settings": "باز کردن تنظیمات", "Switch project…": "تغییر پروژه…",
  "Open system analysis": "باز کردن تحلیل سیستم", "Switch language": "تغییر زبان",
  // system analysis
  "Re-scan": "اسکن مجدد", "Scan complete": "اسکن کامل شد",
  "CUDA available": "CUDA در دسترس", "Ready for GPU training": "آمادهٔ آموزش روی GPU",
  "Graphics (GPU)": "کارت گرافیک (GPU)", "VRAM usage": "مصرف VRAM", "Memory (RAM)": "حافظه (RAM)",
  "Processor (CPU)": "پردازنده (CPU)", "GPU utilization": "بهره‌وری GPU", "CPU utilization": "بهره‌وری CPU",
  "Storage": "فضای ذخیره‌سازی", "Environment": "محیط", "used": "استفاده‌شده", "free": "آزاد",
  "cores": "هسته", "threads": "رشته", "Driver": "درایور", "Live": "زنده",
  // licensing
  "Activate LabelStudio": "فعال‌سازی LabelStudio",
  "A license is now required to use this app. Enter your license key, or register on our website to get one.":
    "برای استفاده از این برنامه اکنون به لایسنس نیاز است. کلید لایسنس خود را وارد کنید یا برای دریافت آن در سایت ما ثبت‌نام کنید.",
  "Your device ID": "شناسهٔ دستگاه شما",
  "License key": "کلید لایسنس",
  "Paste your license key here": "کلید لایسنس را اینجا بچسبانید",
  "Activate": "فعال‌سازی", "Activating…": "در حال فعال‌سازی…",
  "Buy / register a license": "خرید / ثبت‌نام لایسنس",
  "Re-check": "بررسی مجدد", "Copy": "کپی",
  "This license key is not readable. Copy it again from your account.":
    "کلید لایسنس خوانا نیست. دوباره از حساب کاربری‌تان کپی کنید.",
  "This license key is invalid or has been altered.":
    "این کلید لایسنس نامعتبر است یا دستکاری شده است.",
  "This license belongs to a different product.":
    "این لایسنس متعلق به محصول دیگری است.",
  "This license is locked to another device.":
    "این لایسنس به دستگاه دیگری قفل شده است.",
  "This license has expired.": "این لایسنس منقضی شده است.",
  "Activation failed. Check the key and try again.":
    "فعال‌سازی ناموفق بود. کلید را بررسی و دوباره تلاش کنید.",
  "Still locked. The server has not registered a license for this device yet.":
    "هنوز قفل است. سرور هنوز لایسنسی برای این دستگاه ثبت نکرده است.",
  // unsaveable boxes (class name has no index in the project's class list)
  "These boxes could not be saved because their class is not in the class list:":
    "این باکس‌ها ذخیره نشدند چون کلاسشان در فهرست کلاس‌ها نیست:",
  "Add the class in Classes, then save again.":
    "کلاس را در بخش کلاس‌ها اضافه کنید و دوباره ذخیره کنید.",
  "Open Classes": "باز کردن کلاس‌ها",
  // export / split outcomes
  "Open folder": "باز کردن پوشه",
  "The split contains no labels. Check that the annotation format in Settings matches the files on disk.":
    "خروجی تقسیم هیچ لیبلی ندارد. بررسی کنید فرمت حاشیه‌نویسی در تنظیمات با فایل‌های روی دیسک یکی باشد.",
  "The export contains no labels. Check that the annotation format in Settings matches the files on disk.":
    "خروجی گرفته‌شده هیچ لیبلی ندارد. بررسی کنید فرمت حاشیه‌نویسی در تنظیمات با فایل‌های روی دیسک یکی باشد.",
  // auto-label class filter
  "(all the model finds)": "(هرچه مدل پیدا کند)",
  "Nothing selected — every class the model detects is kept. Select classes only to narrow the results.":
    "چیزی انتخاب نشده — همهٔ کلاس‌هایی که مدل تشخیص دهد نگه داشته می‌شود. فقط برای محدود کردن نتایج کلاس انتخاب کنید.",
  "Only these classes will be kept. Names must match what the model outputs.":
    "فقط این کلاس‌ها نگه داشته می‌شوند. نام‌ها باید با خروجی مدل یکی باشد.",
  "Clear selection": "پاک کردن انتخاب",
  "No detections. The selected class filter may not match this model's class names — clear the selection to keep everything it finds.":
    "چیزی تشخیص داده نشد. ممکن است فیلتر کلاس انتخاب‌شده با نام کلاس‌های این مدل یکی نباشد — انتخاب را پاک کنید تا همهٔ نتایج نگه داشته شود.",
  "No detections. Try lowering the confidence threshold, or check that the model fits these images.":
    "چیزی تشخیص داده نشد. آستانهٔ اطمینان را کمتر کنید، یا بررسی کنید مدل با این تصاویر تناسب دارد.",
  // command palette
  "Show welcome tour": "نمایش راهنمای خوش‌آمدگویی",
};

export const t = (k: string): string =>
  (CURRENT_LANG === "fa" && FA[k] != null) ? FA[k] : k;
