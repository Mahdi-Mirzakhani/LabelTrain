import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { Thumb } from "./ui";
import { t, isRTL } from "../i18n";
import { inElectron, pathToAppUrl } from "../ipc";
import { ago, matchesProject, pathTail, projectTitle } from "../lib/projects";
import type { ProjectInfo } from "../types";

interface OnboardingProps {
  onDone: () => void;
  /** Called with the folder the user picked on the last step, so it actually opens. */
  onFolder?: (folder: string) => void;
}

export function Onboarding({ onDone, onFolder }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const slides = [
    { icon: "images", title: t("Label images fast"), body: t("A keyboard-first desktop tool for drawing bounding boxes and exporting clean YOLO datasets — built for speed.") },
    { icon: "sparkles", title: t("Let YOLO do the first pass"), body: t("Auto-label hundreds of images with a pretrained model, then just review and correct. Minutes, not hours.") },
    { icon: "rocket", title: t("Train-ready in one click"), body: t("Split, configure, and export a reproducible bundle with dataset.yaml and a starter script. Drop it straight into Ultralytics.") },
  ];
  const last = step === slides.length;

  const pickFolder = async () => {
    if (!inElectron) { onDone(); return; }
    const folder = await window.api!.openFolderDialog();
    if (!folder) return;              // cancelled — stay on this step
    if (onFolder) onFolder(folder);   // open the folder the user actually chose
    else onDone();
  };

  if (last) {
    return (
      <div className="fullscreen">
        <div className="ob-slide" style={{ maxWidth: 640 }}>
          <span className="section-label">{t("Step 4 of 4")}</span>
          <div className="t-display">{t("Point at a folder of images")}</div>
          <div className="dropzone" onClick={pickFolder} style={{ cursor: "pointer" }}>
            <div style={{
              width: 64, height: 64, borderRadius: 18, background: "var(--surface-2)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Icon name="upload" size={28} style={{ color: "var(--primary)" }} />
            </div>
            <div className="t-subtitle">{t("Drop an image folder here")}</div>
            <div className="t-caption">{t("JPG, PNG, WebP · or browse to select")}</div>
            <button className="btn btn-secondary" style={{ marginTop: 8 }}
              onClick={(e) => { e.stopPropagation(); pickFolder(); }}>
              <Icon name="folder" size={15} />{t("Browse folders")}
            </button>
          </div>
          <div className="row gap-md">
            <button className="btn btn-ghost" onClick={() => setStep(0)}>{t("Back")}</button>
            <button className="btn btn-primary lg" onClick={onDone}>
              {isRTL() ? "بعداً" : "Maybe later"}<Icon name="arrowRight" size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }
  const s = slides[step];
  return (
    <div className="fullscreen">
      <div className="ob-slide">
        <div style={{
          width: 104, height: 104, borderRadius: 28,
          background: "linear-gradient(135deg,var(--primary-hover),var(--primary-active))",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "var(--e3)",
        }}>
          <Icon name={s.icon} size={48} style={{ color: "#fff" }} />
        </div>
        <div className="t-display">{s.title}</div>
        <div className="t-subtitle tsec" style={{ fontWeight: 400, textWrap: "pretty" }}>{s.body}</div>
        <div className="ob-dots" style={{ marginTop: 8 }}>
          {slides.map((_, i) => <span key={i} className={"ob-dot" + (i === step ? " on" : "")} />)}
          <span className={"ob-dot"} />
        </div>
        <div className="row gap-md" style={{ marginTop: 8 }}>
          <button className="btn btn-ghost" onClick={onDone}>{t("Skip")}</button>
          <button className="btn btn-primary lg" onClick={() => setStep(step + 1)}>
            {step === slides.length - 1 ? t("Get started") : t("Next")}
            <Icon name="arrowRight" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

interface ProjectManagerProps {
  onOpen: (p: ProjectInfo) => void;
  onNew: () => void;
}

export function ProjectManager({ onOpen, onNew }: ProjectManagerProps) {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const fa = isRTL();
  const shown = projects.filter(p => matchesProject(query, projectTitle(p.name, p.imageDir), p.imageDir, p.classes));

  const refresh = async () => {
    if (inElectron) {
      const recents = await window.api!.listRecentProjects();
      const reviewed = await Promise.all(recents.map(p =>
        window.api!.loadProgress(p.imageDir).then(r => r.reviewed.length).catch(() => 0)));
      const list: ProjectInfo[] = recents.map((p, i) => ({
        id: "rp_" + i,
        name: p.name,
        imageDir: p.imageDir,
        classes: p.classes,
        format: p.format,
        outputDir: p.outputDir,
        createdAt: p.createdAt,
        lastOpenedAt: p.lastOpenedAt,
        count: p.count,
        labeled: p.labeled,
        labeledAt: p.labeledAt,
        reviewed: reviewed[i],
        thumbs: p.previewPaths?.map(pathToAppUrl),
        fmt: p.format,
      }));
      // Most recently opened first; folders with no images of their own last.
      list.sort((a, b) => Number(!a.count) - Number(!b.count) || b.lastOpenedAt - a.lastOpenedAt);
      setProjects(list);
    } else {
      setProjects([]);
    }
    setLoaded(true);
  };

  useEffect(() => { refresh(); }, []);

  const clearAll = async () => {
    if (!inElectron) return;
    if (!confirm("Remove all recent projects from the list? (Files on disk are NOT deleted)")) return;
    await window.api!.clearRecentProjects();
    await refresh();
  };

  const removeOne = async (p: ProjectInfo, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!inElectron) return;
    const msg = isRTL()
      ? `پروژه «${p.name}» از لیست حذف بشه؟ (فایل‌ها روی دیسک حذف نمی‌شوند)`
      : `Remove project “${p.name}” from the list?\n(Files on disk are NOT deleted.)`;
    if (!confirm(msg)) return;
    await window.api!.removeRecentProject(p.imageDir);
    await refresh();
  };

  return (
    <div className="fullscreen" style={{ overflow: "auto" }}>
      <div className="titlebar" style={{ WebkitAppRegion: "drag" } as React.CSSProperties}>
        <div className="tb-traffic">
          <span style={{ background: "#FF5F57" }} />
          <span style={{ background: "#FEBC2E" }} />
          <span style={{ background: "#28C840" }} />
        </div>
        <div className="tb-logo" style={{ marginLeft: 8 }}>
          <span className="mark"><Icon name="scan" size={14} /></span>LabelStudio
        </div>
        <div className="grow" />
      </div>
      <div style={{ maxWidth: 1080, margin: "0 auto", width: "100%", padding: "var(--sp-3xl) var(--sp-xl)" }}>
        <div className="row" style={{
          justifyContent: "space-between", alignItems: "flex-end", marginBottom: "var(--sp-xl)",
        }}>
          <div className="col gap-sm">
            <span className="t-display">{t("Projects")}</span>
            <span className="t-body tsec">
              {isRTL()
                ? `${projects.length} پروژه`
                : `${projects.length} projects`}
            </span>
          </div>
          <div className="row gap-sm">
            <label className="field" style={{ width: 220 }}>
              <Icon name="search" size={15} className="ic" />
              <input placeholder={t("Search projects…")} value={query}
                onChange={e => setQuery(e.target.value)} />
            </label>
            {inElectron && projects.length > 0 && (
              <button className="btn btn-secondary" onClick={clearAll} title="Clear recent projects list">
                <Icon name="trash" size={15} />Clear list
              </button>
            )}
            <button className="btn btn-primary" onClick={onNew}>
              <Icon name="plus" size={15} />{t("New project")}
            </button>
          </div>
        </div>
        {loaded && projects.length === 0 ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", padding: "var(--sp-3xl) 0",
            textAlign: "center", gap: "var(--sp-md)",
          }}>
            <div style={{
              width: 96, height: 96, borderRadius: 24,
              background: "var(--surface-2)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Icon name="folder" size={40} style={{ color: "var(--text-tertiary)" }} />
            </div>
            <span className="t-subtitle">{isRTL() ? "هنوز پروژه‌ای نیست" : "No projects yet"}</span>
            <span className="t-body tsec" style={{ maxWidth: 360 }}>
              {isRTL()
                ? "روی «پروژهٔ جدید» کلیک کنید و یک پوشهٔ شامل تصاویر را انتخاب کنید."
                : "Click “New project” and point at a folder of images to start labeling."}
            </span>
            <button className="btn btn-primary lg" onClick={onNew} style={{ marginTop: "var(--sp-sm)" }}>
              <Icon name="plus" size={16} />{t("New project")}
            </button>
          </div>
        ) : (
        <div className="pm-grid" style={{ padding: 0 }}>
          {loaded && shown.map(p => {
            const title = projectTitle(p.name, p.imageDir);
            const count = p.count ?? 0;
            const empty = count === 0;
            const classes = p.classes?.length
              ? " · " + p.classes.slice(0, 3).join(", ") + (p.classes.length > 3 ? "…" : "")
              : "";
            return (
              <div key={p.id} className={"pm-card" + (empty ? " pm-empty" : "")} onClick={() => onOpen(p)} title={p.imageDir}>
                <button className="iconbtn sm pm-remove" onClick={(e) => removeOne(p, e)}
                  title={fa ? "حذف از لیست (فایل‌ها روی دیسک می‌مانند)" : "Remove from list (files stay on disk)"}>
                  <Icon name="trash" size={14} />
                </button>
                <div className="col" style={{ gap: 2, minWidth: 0, paddingInlineEnd: 24 }}>
                  <span className="t-subtitle pm-title">{title}</span>
                  <span className="pm-path mono" dir="ltr">{pathTail(p.imageDir)}</span>
                </div>
                <div className="pm-thumbs" style={{ minHeight: 80 }}>
                  {!empty && p.thumbs && p.thumbs.length > 0 ? p.thumbs.map((src, i) => (
                    <Thumb key={src} src={src} label={`${title} preview ${i + 1}`} />
                  )) : (
                    <div className="pm-empty-hint">
                      <Icon name="folder" size={22} />
                      <span>{fa ? "این پوشه مستقیماً عکسی ندارد" : "No images directly in this folder"}</span>
                      <span>{fa ? "عکس‌ها احتمالاً در زیرپوشه‌ای مثل images/ هستند" : "They are probably in a subfolder such as images/"}</span>
                    </div>
                  )}
                </div>
                {!empty && (
                  <div className="pm-stats">
                    <Stat icon="check" label={t("labeled")} value={p.labeledAt ? p.labeled ?? 0 : null} total={count}
                      color="var(--success)"
                      unknown={fa ? "با باز کردن پروژه شمرده می‌شود" : "Counted the next time the project is opened"} />
                    <Stat icon="eye" label={t("reviewed")} value={p.reviewed ?? 0} total={count} color="var(--primary)" />
                  </div>
                )}
                <div className="pm-foot">
                  <span>{count.toLocaleString()} {t("images")} · {p.fmt ?? p.format}{classes}</span>
                  <span>{ago(p.lastOpenedAt, fa)}</span>
                </div>
              </div>
            );
          })}
          <button className="pm-card pm-new" onClick={onNew}>
            <div style={{
              width: 48, height: 48, borderRadius: 14, background: "var(--surface-2)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Icon name="plus" size={24} />
            </div>
            <span className="t-body-strong">{t("New project")}</span>
            <span className="t-caption">{t("Start from a folder of images")}</span>
          </button>
        </div>
        )}
      </div>
    </div>
  );
}

/** One progress row on a project card: icon, label, bar, "count (pct%)"; `value` null = not known yet. */
function Stat({ icon, label, value, total, color, unknown }: {
  icon: string; label: string; value: number | null; total: number; color: string; unknown?: string;
}) {
  const pct = value !== null && total ? Math.min(100, (value / total) * 100) : 0;
  const pctText = pct > 0 && pct < 1 ? "<1" : String(Math.round(pct));
  return (
    <div className="pm-stat" title={value === null ? unknown : undefined}>
      <Icon name={icon} size={12} style={{ color, flex: "none" }} />
      <span className="pm-stat-label">{label}</span>
      <span className="pm-stat-bar"><span style={{ width: `${pct}%`, background: color }} /></span>
      <span className="pm-stat-num tnum">
        {value === null ? "—" : <>{value.toLocaleString()} <span className="pm-stat-pct">{pctText}%</span></>}
      </span>
    </div>
  );
}
