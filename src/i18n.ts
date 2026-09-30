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
  // duplicates tab ("Copy", "Undo", "Cancel", "Nothing to undo" are defined elsewhere)
  "Duplicates": "تکراری‌ها", "Find duplicate images": "پیدا کردن عکس‌های تکراری",
  "Scan for duplicates": "جستجوی تکراری‌ها", "Rescan": "اسکن دوباره", "This folder": "همین پوشه",
  "Whole dataset": "کل دیتاست", "Look-alikes (needs torch)": "عکس‌های شبیه (نیاز به torch)",
  "Undo last removal": "برگرداندن آخرین حذف", "Listing images": "فهرست کردن عکس‌ها",
  "Reading images": "خواندن عکس‌ها", "Comparing": "مقایسه", "No images to scan": "عکسی برای اسکن نیست",
  "Look-alikes were skipped": "سطح «شبیه» اجرا نشد",
  "Exact copy": "کپی یکسان", "Look-alike": "شبیه", "Exact only": "فقط یکسان", "Copies": "کپی‌ها",
  "+ Crops & frames": "+ برش و فریم", "Loose": "آزادتر", "Custom": "دلخواه",
  "the same file twice": "یک فایل، دو بار",
  "resized, re-saved, mirrored or letterboxed": "تغییر اندازه، ذخیرهٔ دوباره، آینه یا حاشیه‌دار",
  "cropped, zoomed, recoloured, or the next frame of a video": "بریده، بزرگ‌نمایی‌شده، تغییر رنگ، یا فریم بعدی یک ویدیو",
  "Nothing is deleted: extras move, with their label files, to a folder beside the dataset, and Undo puts them back. A copy shared by train and test is the one that matters most — it makes test scores look better than they are.":
    "چیزی پاک نمی‌شود: نسخه‌های اضافه همراه فایل لیبلشان به پوشه‌ای کنار دیتاست می‌روند و «برگرداندن» آن‌ها را برمی‌گرداند. مهم‌ترین تکراری، عکسی است که هم در train هست هم در test — نمرهٔ test را بهتر از واقعیت نشان می‌دهد.",
  "Sensitivity": "حساسیت", "Copies: hash distance": "کپی‌ها: فاصلهٔ hash",
  "Look-alikes: similarity": "شبیه‌ها: شباهت", "groups": "گروه", "images to move out": "عکس برای بیرون بردن",
  "groups across splits": "گروه بین splitها", "freed": "فضای آزادشده", "images scanned": "عکس اسکن‌شده",
  "All": "همه", "Exact": "یکسان", "Look-alikes": "شبیه‌ها", "Across splits only": "فقط بین splitها",
  "No duplicates at this sensitivity": "با این حساسیت تکراری‌ای نیست",
  "Which copy is suggested to stay when a group crosses splits": "وقتی گروهی بین splitهاست، کدام نسخه بماند",
  "Prefer keeping the train copy": "نسخهٔ train بماند", "Move all extras out": "بیرون بردن همهٔ اضافه‌ها",
  "Pick a group": "یک گروه انتخاب کنید", "group": "گروه", "Labels": "لیبل‌ها", "Side by side": "کنار هم",
  "Flicker compare": "مقایسهٔ چشمک‌زن", "Not duplicates": "تکراری نیستند", "Move extras out": "بیرون بردن اضافه‌ها",
  "next / previous group": "گروه بعدی / قبلی", "keep only this one": "فقط این بماند", "move extras out": "بیرون بردن اضافه‌ها",
  "not duplicates": "تکراری نیستند", "flicker": "چشمک", "labels": "لیبل‌ها", "undo": "برگرداندن",
  "identical file": "فایل یکسان", "hash distance": "فاصلهٔ hash", "similarity": "شباهت", "mirrored": "آینه‌ای",
  "Open a project first": "اول یک پروژه باز کنید",
  "How hard to look": "چقدر دقیق بگردد", "Hashes only": "فقط hash", "Fast": "سریع", "Standard": "استاندارد", "Strong": "قوی",
  "Only exact and resized / mirrored copies. No torch needed.": "فقط کپی‌های یکسان و تغییراندازه/آینه‌ای. به torch نیاز ندارد.",
  "Adds look-alikes: cropped, recoloured, video frames.": "عکس‌های شبیه را هم پیدا می‌کند: بریده، تغییر رنگ، فریم‌های ویدیو.",
  "Tells a changed copy from a different photo best. Downloads ~350 MB the first time.": "کپی تغییرکرده را از عکس متفاوت بهتر از همه تشخیص می‌دهد. بار اول حدود ۳۵۰ مگ دانلود می‌کند.",
  "scanned before — quick": "قبلاً اسکن شده — سریع", "+ Pixel alignment": "+ هم‌ترازی پیکسلی", "pixel alignment": "هم‌ترازی پیکسلی",
  "Lines each image up with its nearest neighbours pixel by pixel — finds heavy crops, shifts, turns and mirrored copies. Slower the first time.":
    "هر عکس را پیکسل‌به‌پیکسل با نزدیک‌ترین همسایه‌هایش هم‌تراز می‌کند — برش، جابه‌جایی و چرخش شدید و کپی آینه‌ای را پیدا می‌کند. بار اول کندتر است.",
  "Choose Standard, Strong or Thorough first: the model picks which images to line up.":
    "اول «استاندارد»، «قوی» یا «کامل» را انتخاب کنید: مدل تعیین می‌کند کدام عکس‌ها با هم هم‌تراز شوند.",
  "Always on in Thorough.": "در حالت «کامل» همیشه روشن است.",
  "Thorough": "کامل",
  "Leaves nothing out: Meta's copy detector (SSCD) picks each image's closest, turned too, and every pair is lined up pixel by pixel, mirrored too. For a computer with an NVIDIA GPU; the slowest. ~180 MB more to download the first time.":
    "چیزی جا نمی‌ماند: مدل کپی‌یاب Meta (SSCD) نزدیک‌ترین عکس‌ها به هر عکس را — چرخیده هم — پیدا می‌کند و هر جفت پیکسل‌به‌پیکسل، آینه‌ای هم، هم‌تراز می‌شود. برای کامپیوتر با کارت گرافیک NVIDIA؛ کندترین. بار اول حدود ۱۸۰ مگ بیشتر دانلود می‌کند.",
  "Part of the scan could not run": "بخشی از اسکن اجرا نشد",
  "downloading": "در حال دانلود", "the first time it downloads up to ~530 MB": "بار اول تا حدود ۵۳۰ مگ دانلود می‌کند",
  "Line up each image with its closest by SSCD, pixel by pixel, mirrored too":
    "هم‌تراز کردن پیکسل‌به‌پیکسل هر عکس با نزدیک‌ترین‌هایش از نظر SSCD، آینه‌ای هم",
  "Scanned": "اسکن شد:", "images with": "عکس با", "in": "در", "Missing some?": "چیزی جا مانده؟", "Try": "امتحان",
  "could not run": "اجرا نشد", "Same photo": "همان عکس", "Same photo (aligned)": "همان عکس (هم‌تراز)",
  "A stronger model may find what this one missed:": "شاید مدل قوی‌تر آنچه این مدل ندید را پیدا کند:", "Scan with": "اسکن با",
  "Looking for duplicates": "در حال جستجوی تکراری‌ها", "elapsed": "گذشته", "left": "مانده",
  "List the images": "فهرست کردن عکس‌ها", "Load": "بارگذاری", "the first time it downloads ~350 MB": "بار اول حدود ۳۵۰ مگ دانلود می‌کند",
  "Read and hash every image": "خواندن و hash کردن هر عکس", "Read, hash and describe every image": "خواندن، hash و توصیف هر عکس با مدل",
  "cached from an earlier scan": "از اسکن قبلی در کش", "to read": "برای خواندن",
  "Compare every image with every other": "مقایسهٔ هر عکس با همهٔ عکس‌های دیگر",
  "Line up each image with its nearest neighbours, pixel by pixel": "هم‌تراز کردن پیکسل‌به‌پیکسل هر عکس با نزدیک‌ترین همسایه‌هایش",
  "pairs": "جفت", "lines up pixel for pixel": "پیکسل‌به‌پیکسل هم‌تراز است",
  "You can switch to another tab — the scan keeps running, and a second scan of the same images takes seconds.":
    "می‌توانید به تب دیگری بروید — اسکن ادامه پیدا می‌کند، و اسکن دوبارهٔ همین عکس‌ها چند ثانیه طول می‌کشد.",
  "Marked as not duplicates — they will not be grouped again": "ثبت شد که تکراری نیستند — دیگر با هم گروه نمی‌شوند",
  "Some files could not be moved": "بعضی فایل‌ها جابه‌جا نشدند",
  "images moved out of the dataset, with their labels": "عکس همراه لیبل‌هایش از دیتاست بیرون رفت",
  "images put back": "عکس برگشت", "left in quarantine: their place is taken": "در قرنطینه ماند: جایش گرفته شده",
  "Same labels": "لیبل یکسان", "Or compare the labels": "یا مقایسهٔ لیبل‌ها", "no pixels read · seconds": "بدون خواندن پیکسل · چند ثانیه",
  "Two images count as duplicates when they are the same size, have the same number of boxes, and every box sits in the same place — within 1 px, which you can change after the scan. The order of the boxes does not matter, nor their class unless you ask.":
    "دو عکس تکراری حساب می‌شوند اگر هم‌اندازه باشند، تعداد کادرهایشان یکی باشد و هر کادر سر جای کادری از عکس دیگر باشد — با اختلاف حداکثر ۱ پیکسل، که بعد از اسکن قابل تغییر است. ترتیب کادرها مهم نیست، کلاسشان هم مهم نیست مگر خودتان بخواهید.",
  "Finds a copy saved under another name or re-exported with its labels, whatever was done to its pixels. Images without boxes are skipped. Frames of a still camera whose boxes did not move match too — compare those side by side before moving them out.":
    "کپی‌ای را پیدا می‌کند که با اسم دیگری ذخیره شده یا همراه لیبل‌هایش دوباره خروجی گرفته شده، هر تغییری هم در پیکسل‌هایش داده شده باشد. عکس‌های بدون کادر کنار گذاشته می‌شوند. فریم‌های یک دوربین ثابت که کادرهایشان تکان نخورده هم جور درمی‌آیند — پیش از بیرون بردن، آن‌ها را کنار هم ببینید.",
  "Same size, same number of boxes, and box for box:": "هم‌اندازه، با تعداد کادر یکسان، و کادر به کادر:",
  "every corner within": "هر گوشه با اختلاف حداکثر", "Classes must match too": "کلاس‌ها هم باید یکی باشند",
  "No two images share their size and boxes": "هیچ دو عکسی اندازه و کادرهای یکسان ندارند", "classes differ": "کلاس‌ها فرق دارند",
  "same size and boxes, corners within": "هم‌اندازه با کادرهای یکسان، گوشه‌ها با اختلاف حداکثر",
  "same size and boxes, exactly": "هم‌اندازه با کادرهای دقیقاً یکسان",
  "Read each image's size and label file": "خواندن اندازهٔ هر عکس و فایل لیبلش",
  "Compare the boxes of images with the same size and box count": "مقایسهٔ کادرهای عکس‌های هم‌اندازه و هم‌تعداد",
  "pairs you marked “Not duplicates” are hidden": "جفتی که «تکراری نیستند» زده بودید پنهان است",
  "You can switch to another tab — the scan keeps running.": "می‌توانید به تب دیگری بروید — اسکن ادامه پیدا می‌کند.",
  "Change method": "تغییر روش", "Pick another way to look, and scan again": "روش دیگری انتخاب کنید و دوباره اسکن کنید",
  "Back to the results": "برگشت به نتیجه‌ها", "Choose another method": "روش دیگری انتخاب کنید",
  "kept last time": "دفعهٔ قبل ماند", "This image stayed when its look-alikes were moved out before": "این عکس وقتی شبیه‌هایش قبلاً بیرون رفتند، ماند",
  "images moved out earlier — none of them is in this scan": "عکسی که قبلاً بیرون بردید در این اسکن نیست",
  "They wait in the folder beside the dataset. Look-alikes found now are other files — often other frames of the same video; the image kept last time is marked.":
    "در پوشهٔ کنار دیتاست منتظرند. شبیه‌هایی که الان پیدا شده فایل‌های دیگری‌اند — اغلب فریم‌های دیگرِ همان ویدیو؛ عکسی که دفعهٔ قبل ماند علامت دارد.",
  "Review list": "فهرست بازبینی", "To review": "برای بازبینی", "All flagged": "همهٔ موارد مشکوک",
  "to review": "برای بازبینی", "flagged": "مشکوک", "Filter → To review": "فیلتر ← برای بازبینی",
  "Hints": "راهنما", "Show where the audit found a problem": "نشان دادن جای مشکل روی تصویر",
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
