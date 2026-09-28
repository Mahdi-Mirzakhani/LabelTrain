import { useMemo, useState } from "react";
import { Icon } from "./Icon";
import { Checkbox, CodeBlock, CountUp, Img, Pill, Slider, Switch, Thumb } from "./ui";
import { t } from "../i18n";
import { TRAIN_PROFILES } from "../data";
import { classDistribution, datasetHealth, filterRows } from "../lib/dataset";
import { rebalanceRatios, ratiosSumOk, splitCounts, type Ratios } from "../lib/split";
import type { ClassDef, ImageItem, ProjectInfo } from "../types";

interface ToastBody { icon?: string; msg: string; }

interface DatasetRouteProps {
  images: ImageItem[];
  classes: ClassDef[];
  classColor: (id: string) => string;
  openImage: (i: number) => void;
  onExport?: (opts?: { labeledOnly?: boolean; zip?: boolean }) => void;
}

export function DatasetRoute({ images, classes, classColor, openImage, onExport }: DatasetRouteProps) {
  const [selRow, setSelRow] = useState<number | null>(null);
  const [hoverBar, setHoverBar] = useState<string | null>(null);
  const [classFilter, setClassFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | "labeled" | "unlabeled">("all");
  const total = images.length;
  const labeled = images.filter(i => i.labeled).length;
  const anns = images.reduce((a, i) => a + i.boxes.length, 0);

  // Boxes carry the class NAME; the filter checkboxes carry class ids — resolve.
  const selectedNames = useMemo(
    () => new Set(classes.filter(c => classFilter.includes(c.id)).map(c => c.name)),
    [classes, classFilter],
  );
  // Rows for the table, after applying the class + status filters. Keep the
  // original image index so selection / "open in Annotate" stay correct.
  const rows = useMemo(() => filterRows(images, selectedNames, statusFilter),
    [images, selectedNames, statusFilter]);
  const ROW_CAP = 200;

  // Class distribution — computed from real annotations
  const classDist = useMemo(() => classDistribution(images), [images]);
  const maxC = classDist.length > 0 ? Math.max(...classDist.map(d => d.count)) : 1;

  // Dataset health — computed insights, no hardcoded fakes
  const health = useMemo(() => datasetHealth(images), [images]);

  const kpis = [
    { num: total, lbl: t("Total images"), trend: `${labeled} labeled` },
    { num: labeled, lbl: t("Labeled"), trend: `${total ? Math.round(labeled / total * 100) : 0}% complete` },
    { num: anns, lbl: t("Annotations"), trend: labeled ? `${(anns / labeled).toFixed(1)} avg / image` : "—" },
    { num: classes.length, lbl: t("Classes"), trend: `${classDist.length} in use` },
  ];

  return (
    <div className="body">
      <div className="sidebar">
        <div className="list-head"><span className="section-label">{t("Filter & query")}</span></div>
        <div className="scroll pad" style={{ display: "flex", flexDirection: "column", gap: "var(--sp-xl)" }}>
          <div className="col gap-md">
            <span className="t-label tsec">{t("By class")}</span>
            {classes.map(c => (
              <Checkbox key={c.id} on={classFilter.includes(c.id)}
                onChange={() => setClassFilter(f => f.includes(c.id) ? f.filter(x => x !== c.id) : [...f, c.id])}
                label={<span className="row gap-sm"><span className="dot" style={{ width: 9, height: 9, borderRadius: 2, background: c.color, display: "inline-block" }} />{c.name}</span>} />
            ))}
          </div>
          <div className="col gap-md">
            <span className="t-label tsec">{t("Status")}</span>
            {([
              ["all", "All images"],
              ["labeled", "Has annotations"],
              ["unlabeled", "Unlabeled"],
            ] as const).map(([val, label]) => (
              <Checkbox key={val} on={statusFilter === val}
                onChange={() => setStatusFilter(val)} label={t(label)} />
            ))}
          </div>
          {(classFilter.length > 0 || statusFilter !== "all") && (
            <button className="btn btn-secondary sm" style={{ alignSelf: "flex-start" }}
              onClick={() => { setClassFilter([]); setStatusFilter("all"); }}>
              <Icon name="x" size={13} />{t("Clear filters")}
            </button>
          )}
        </div>
      </div>

      <div className="workspace">
        <div className="wsbar">
          <span className="t-title">{t("Dataset overview")}</span>
          <div className="row gap-sm">
            <button className="btn btn-secondary sm" onClick={() => onExport?.()}>
              <Icon name="download" size={14} />{t("Export all")}
            </button>
            <button className="btn btn-secondary sm" onClick={() => onExport?.({ zip: true })}>
              <Icon name="download" size={14} />{t("Export ZIP")}
            </button>
          </div>
        </div>
        <div className="scroll pad col" style={{ gap: "var(--sp-xl)" }}>
          <div className="kpi-grid">
            {kpis.map(k => (
              <div className="kpi" key={k.lbl}>
                <div className="num tnum"><CountUp value={k.num} /></div>
                <div className="lbl">{k.lbl}</div>
                <div className="t-caption" style={{ marginTop: 8, color: "var(--success)" }}>{k.trend}</div>
              </div>
            ))}
          </div>

          <div className="card pad">
            <div className="row" style={{ justifyContent: "space-between", marginBottom: "var(--sp-md)" }}>
              <span className="t-subtitle">{t("Class distribution")}</span>
              <span className="t-caption">{anns.toLocaleString()} {t("instances")}</span>
            </div>
            <div className="bars">
              {classDist.length === 0 ? (
                <div className="t-caption tsec" style={{ padding: "var(--sp-md)" }}>
                  No annotations yet. Draw some boxes in the Annotate tab.
                </div>
              ) : classDist.map(d => (
                <div className="bar-col" key={d.cls}
                  onMouseEnter={() => setHoverBar(d.cls)}
                  onMouseLeave={() => setHoverBar(null)}>
                  {hoverBar === d.cls && (
                    <span className="t-caption tnum" style={{ color: "var(--text)" }}>
                      {d.count} · {Math.round(d.count / anns * 100)}%
                    </span>
                  )}
                  <div className="bar" style={{ height: `${d.count / maxC * 100}%`, background: classColor(d.cls) }} />
                  <span className="t-caption" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
                    {d.cls}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ overflow: "hidden" }}>
            <div className="row" style={{ justifyContent: "space-between", padding: "var(--sp-sm) var(--sp-md)" }}>
              <span className="t-caption tsec">
                {rows.length === total
                  ? `${total.toLocaleString()} ${t("images")}`
                  : `${t("Showing")} ${rows.length.toLocaleString()} ${t("of")} ${total.toLocaleString()}`}
                {rows.length > ROW_CAP ? ` · ${t("first")} ${ROW_CAP}` : ""}
              </span>
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 52 }}></th><th>Filename</th>
                  <th style={{ width: 70 }}>Boxes</th>
                  <th>Classes</th>
                  <th style={{ width: 90 }}>Status</th>
                  <th style={{ width: 110 }}>Modified</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, ROW_CAP).map(({ im, i }) => {
                  const cls = [...new Set(im.boxes.map(b => b.cls))];
                  return (
                    <tr key={im.id} onClick={() => setSelRow(i)}
                      style={{ background: selRow === i ? "var(--selection)" : undefined }}
                      onDoubleClick={() => openImage(i)}>
                      <td><Thumb src={im.thumb} label={im.name}
                        style={{ width: 36, height: 28, borderRadius: 4, objectFit: "cover" }} /></td>
                      <td className="mono">{im.name}</td>
                      <td className="tnum">{im.boxes.length}</td>
                      <td>
                        <div className="row gap-sm" style={{ flexWrap: "wrap" }}>
                          {cls.slice(0, 4).map(c => (
                            <span key={c} className="dot" style={{
                              width: 9, height: 9, borderRadius: 2, background: classColor(c),
                              display: "inline-block",
                            }} />
                          ))}
                          {cls.length > 4 && <span className="t-caption">+{cls.length - 4}</span>}
                        </div>
                      </td>
                      <td>{im.labeled ? <Pill kind="success" dot>labeled</Pill> : <Pill kind="muted">empty</Pill>}</td>
                      <td className="t-caption">{im.modified}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="inspector">
        <div className="panel-head">
          <span className="t-body-strong">{selRow == null ? t("Dataset health") : t("Image preview")}</span>
        </div>
        <div className="scroll pad col" style={{ gap: "var(--sp-md)" }}>
          {selRow == null ? health.map((h, i) => (
            <div key={i} className="row gap-md" style={{
              alignItems: "flex-start", padding: "var(--sp-md)",
              borderRadius: "var(--r-md)", background: "var(--surface-2)",
              boxShadow: "inset 0 0 0 1px var(--border)",
            }}>
              <Icon name={h.sev === "danger" ? "alert" : h.sev === "warning" ? "alert" : "info"}
                size={16} style={{ color: `var(--${h.sev === "info" ? "info" : h.sev})`, marginTop: 1, flex: "none" }} />
              <span className="t-body">{h.text}</span>
            </div>
          )) : (
            <div className="col gap-md">
              <Img src={images[selRow].url} label={images[selRow].name}
                style={{ width: "100%", borderRadius: "var(--r-lg)", aspectRatio: "3/2", objectFit: "cover" }} />
              <div className="mono t-body">{images[selRow].name}</div>
              <div className="t-caption">
                {images[selRow].boxes.length} boxes · {images[selRow].modified}
              </div>
              <button className="btn btn-primary" onClick={() => openImage(selRow)}>
                <Icon name="edit" size={14} />{t("Open in Annotate")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface TrainRouteProps {
  classes: ClassDef[];
  images: ImageItem[];
  project: ProjectInfo | null;
  pushToast: (t: ToastBody) => void;
  onExportSplit: (cfg: { ratios: { train: number; val: number; test: number }; seed: number; copy: boolean; yaml: boolean; trainPy: boolean }) => Promise<void>;
}

export function TrainRoute({ classes, images, project, pushToast, onExportSplit }: TrainRouteProps) {
  const [profile, setProfile] = useState("small");
  const [ratios, setRatios] = useState({ train: .7, val: .2, test: .1 });
  const [seed, setSeed] = useState(42);
  const [imgsz, setImgsz] = useState(640);
  const [epochs, setEpochs] = useState(100);
  const [batch, setBatch] = useState(16);
  const [copyImgs, setCopyImgs] = useState(true);
  const [genYaml, setGenYaml] = useState(true);
  const [genTrainPy, setGenTrainPy] = useState(true);
  const [focus, setFocus] = useState<keyof typeof help | null>(null);
  const model = TRAIN_PROFILES.find(p => p.id === profile)?.model ?? "yolov8s";

  const setRatio = (key: keyof Ratios, v: number) => setRatios(r => rebalanceRatios(r, key, v));
  const sumOk = ratiosSumOk(ratios);
  const namesLines = classes.map((c, i) => `  ${i}: ${c.name}`).join("\n");
  // The real dataset.yaml gets the absolute output root, which is only known
  // once the user picks a destination. Say that, instead of the old hardcoded
  // "./dataset" that never matched the file actually written.
  const yaml = `path: <output folder you pick on export>
train: images/train
val: images/val
test: images/test

nc: ${classes.length}
names:
${namesLines}`;
  const cli = `yolo train data=dataset.yaml model=${model}.pt \\\n  epochs=${epochs} imgsz=${imgsz} batch=${batch} seed=${seed}`;

  const help = {
    val: { t: "Validation ratio", d: "Held-out images used to measure generalization during training. 15–20% is typical; too small and the metric gets noisy." },
    imgsz: { t: "Image size", d: "Inference/training resolution. 640 is the sweet spot for speed; 1280 helps small objects but is ~4× slower." },
    epochs: { t: "Epochs", d: "Full passes over the training set. Start at 100 for a fresh model; watch for the loss plateauing." },
    seed: { t: "Random seed", d: "Fixes the train/val/test shuffle so a split is reproducible across runs." },
  } as const;
  const hk = focus && help[focus]
    ? help[focus]
    : { t: "Training config", d: "Build a reproducible training bundle. Focus a field for contextual guidance." };

  return (
    <div className="body">
      <div className="sidebar">
        <div className="list-head"><span className="section-label">{t("Training profiles")}</span></div>
        <div className="scroll pad col gap-md">
          {TRAIN_PROFILES.map(p => (
            <div key={p.id} className="pm-card"
              style={{
                padding: "var(--sp-md) var(--sp-lg)",
                boxShadow: profile === p.id ? "inset 0 0 0 1.5px var(--primary)" : "inset 0 0 0 1px var(--border)",
              }}
              onClick={() => { setProfile(p.id); setEpochs(p.epochs); setImgsz(p.imgsz); }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="t-body-strong">{p.name}</span>
                {profile === p.id && <Icon name="check" size={15} style={{ color: "var(--primary)" }} />}
              </div>
              <div className="t-caption mono" style={{ marginTop: 4 }}>
                {p.model} · {p.epochs}ep · {p.imgsz}px
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="workspace">
        <div className="wsbar">
          <span className="t-title">{t("Export training bundle")}</span>
          {!sumOk && <Pill kind="warning" dot>{t("ratios must sum to 1.0")}</Pill>}
        </div>
        <div className="scroll pad" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--sp-xl)", alignItems: "start" }}>
          <div className="col" style={{ gap: "var(--sp-xl)" }}>
            <div className="card pad col gap-sm">
              <span className="t-caption">{t("Source dataset")}</span>
              <span className="t-subtitle">
                {project?.name ?? "(no project open)"} · {images.length} images
              </span>
              <span className="t-caption">
                {images.filter(i => i.labeled).length} labeled · {classes.length} classes · {project?.format ?? "YOLO"} format
              </span>
            </div>

            <div className="col gap-md">
              <span className="t-label tsec">{t("Train / Val / Test split")}</span>
              {(["train", "val", "test"] as const).map(k => (
                <div className="row gap-md" key={k}>
                  <span className="t-body" style={{ width: 44, textTransform: "capitalize" }}>
                    {t(k.charAt(0).toUpperCase() + k.slice(1))}
                  </span>
                  <Slider value={ratios[k]} min={0} max={1} step={0.05} onChange={v => setRatio(k, v)} />
                  <span className="mono t-body tnum" style={{ width: 38, textAlign: "right" }}>
                    {Math.round(ratios[k] * 100)}%
                  </span>
                </div>
              ))}
            </div>

            <div className="coord-grid">
              <div className="coord-cell" onFocus={() => setFocus("seed")}>
                <label>{t("Random seed")}</label>
                <label className="field"><input type="number" value={seed} onChange={e => setSeed(+e.target.value)} /></label>
              </div>
              <div className="coord-cell" onFocus={() => setFocus("imgsz")}>
                <label>{t("Image size")}</label>
                <label className="field" style={{ paddingRight: 4 }}>
                  <input type="number" value={imgsz} onChange={e => setImgsz(+e.target.value)} />
                </label>
              </div>
              <div className="coord-cell" onFocus={() => setFocus("epochs")}>
                <label>{t("Epochs")}</label>
                <label className="field"><input type="number" value={epochs} onChange={e => setEpochs(+e.target.value)} /></label>
              </div>
              <div className="coord-cell">
                <label>{t("Batch size")}</label>
                <label className="field"><input type="number" value={batch} onChange={e => setBatch(+e.target.value)} /></label>
              </div>
            </div>

            <div className="col gap-md">
              {([
                ["Copy images to output folders", copyImgs, setCopyImgs],
                ["Generate dataset.yaml", genYaml, setGenYaml],
                ["Generate train.py starter", genTrainPy, setGenTrainPy],
              ] as const).map(([lab, val, set], i) => (
                <div className="row" key={i} style={{ justifyContent: "space-between" }}>
                  <span className="t-body">{t(lab)}</span>
                  <Switch on={val} onChange={set} />
                </div>
              ))}
            </div>
          </div>

          <div className="col" style={{ gap: "var(--sp-lg)" }}>
            <div className="col gap-sm">
              <span className="t-label tsec">dataset.yaml</span>
              <CodeBlock onCopy={() => pushToast({ icon: "copy", msg: "dataset.yaml copied" })}>
                {yaml.split("\n").map((l, i) => <div key={i}>{l}</div>)}
              </CodeBlock>
            </div>
            <div className="col gap-sm">
              <span className="t-label tsec">{t("CLI command")}</span>
              <CodeBlock onCopy={() => pushToast({ icon: "copy", msg: "Command copied" })}>
                <span className="tok-cmd">{cli}</span>
              </CodeBlock>
            </div>
            <button className="btn btn-primary lg" style={{ alignSelf: "flex-end" }}
              onClick={() => onExportSplit({ ratios, seed, copy: copyImgs, yaml: genYaml, trainPy: genTrainPy })}
              disabled={!sumOk || images.length === 0}>
              <Icon name="download" size={16} />{t("Export training bundle")}
            </button>
          </div>
        </div>
      </div>

      <div className="inspector">
        <div className="panel-head"><span className="t-body-strong">{t("Help")}</span></div>
        <div className="pad col gap-md">
          <span className="t-subtitle">{hk.t}</span>
          <span className="t-body tsec">{hk.d}</span>
          <div className="card pad col gap-sm" style={{ marginTop: "var(--sp-md)" }}>
            <span className="t-caption">{t("Resulting split")}</span>
            <div className="row gap-sm" style={{ height: 10, borderRadius: 5, overflow: "hidden" }}>
              <div style={{ flex: ratios.train, background: "var(--primary)" }} />
              <div style={{ flex: ratios.val, background: "var(--info)" }} />
              <div style={{ flex: ratios.test, background: "var(--warning)" }} />
            </div>
            <div className="t-caption tnum">
              {(() => { const c = splitCounts(images.length, ratios); return `~${c.train} train · ${c.val} val · ${c.test} test`; })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface DeployRouteProps {
  project: ProjectInfo | null;
  classes: ClassDef[];
  pushToast: (t: ToastBody) => void;
}

export function DeployRoute({ project, classes, pushToast }: DeployRouteProps) {
  const projectName = project?.name ?? "(no project)";
  const datasetPath = project?.imageDir ?? "./dataset";
  const namesLines = classes.map((c, i) => `  ${i}: ${c.name}`).join("\n");
  const yaml = `path: ${datasetPath.replaceAll("\\", "/")}\ntrain: images/train\nval: images/val\ntest: images/test\n\nnc: ${classes.length}\nnames:\n${namesLines}`;

  return (
    <div className="body">
      <div className="workspace" style={{ flex: 2 }}>
        <div className="wsbar"><span className="t-title">{t("Deploy & bundle")}</span></div>
        <div className="scroll pad col" style={{ gap: "var(--sp-xl)", maxWidth: 760 }}>
          <div className="card pad col gap-sm">
            <span className="t-caption">{t("Source dataset")}</span>
            <span className="t-subtitle">{projectName}</span>
            <span className="t-caption mono">{datasetPath}</span>
          </div>

          <div className="col gap-md">
            <span className="t-label tsec">Next steps</span>
            <div className="t-body tsec">
              1. Use the <b>Train</b> tab to split your labels into train/val/test and write a
              {" "}<code>dataset.yaml</code> file. <br />
              2. Copy the dataset folder to your training machine (or run training locally). <br />
              3. Use the commands on the right with the path Train produced.
            </div>
          </div>

          <div className="col gap-sm">
            <span className="t-label tsec">dataset.yaml (preview)</span>
            <CodeBlock onCopy={() => pushToast({ icon: "copy", msg: "dataset.yaml copied" })}>
              {yaml.split("\n").map((l, i) => <div key={i}>{l}</div>)}
            </CodeBlock>
          </div>
        </div>
      </div>

      <div className="inspector">
        <div className="panel-head"><span className="t-body-strong">{t("How to use this bundle")}</span></div>
        <div className="scroll pad col gap-lg">
          {[
            ["Ultralytics CLI", "yolo train data=dataset.yaml \\\n  model=yolov8s.pt epochs=100"],
            ["Local Python", "from ultralytics import YOLO\nYOLO('yolov8s.pt').train(\n  data='dataset.yaml')"],
            ["Colab", "!pip install ultralytics\n!yolo train data=dataset.yaml"],
          ].map(([title, code]) => (
            <div className="col gap-sm" key={title}>
              <span className="t-label tsec">{title}</span>
              <CodeBlock onCopy={() => pushToast({ icon: "copy", msg: "Copied" })}>
                {code.split("\n").map((l, i) => <div key={i} className="tok-cmd">{l}</div>)}
              </CodeBlock>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
