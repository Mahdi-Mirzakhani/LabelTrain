import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { KbdGroup, Thumb, Tip } from "./ui";
import { t } from "../i18n";
import { SHORTCUTS } from "../data";
import { clampRect } from "../lib/boxes";
import { normalizeAngle, toDeg, toRad } from "../lib/obb";
import type { ClassDef, ImageItem, NBox } from "../types";

interface FileListProps {
  images: ImageItem[];
  curIdx: number;
  setCurIdx: (i: number) => void;
  search: string;
  setSearch: (s: string) => void;
  filter: "all" | "labeled" | "unlabeled";
  setFilter: (f: "all" | "labeled" | "unlabeled") => void;
  classes: ClassDef[];
  classFilter: string | null;
  setClassFilter: (c: string | null) => void;
  classNameOf: (key: string) => string;
  loading: boolean;
}

export function FileList({
  images, curIdx, setCurIdx, search, setSearch, filter, setFilter,
  classes, classFilter, setClassFilter, classNameOf, loading,
}: FileListProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowHeight = 52;
  const overscan = 12;
  const filtered = useMemo(() => images
    .map((im, i) => ({ im, i }))
    .filter(({ im }) => im.name.toLowerCase().includes(search.toLowerCase()))
    .filter(({ im }) => filter === "all" || (filter === "labeled" ? im.labeled : !im.labeled))
    .filter(({ im }) => !classFilter || im.boxes.some(b => classNameOf(b.cls) === classFilter)),
    [images, search, filter, classFilter, classNameOf]);
  const labeledCount = useMemo(() => images.filter(i => i.labeled).length, [images]);
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(filtered.length, start + 60);
  const visible = filtered.slice(start, end);

  useEffect(() => {
    const position = filtered.findIndex(({ i }) => i === curIdx);
    const scroller = scrollRef.current;
    if (position < 0 || !scroller) return;
    const top = position * rowHeight;
    const bottom = top + rowHeight;
    if (top < scroller.scrollTop) scroller.scrollTop = top;
    else if (bottom > scroller.scrollTop + scroller.clientHeight) {
      scroller.scrollTop = bottom - scroller.clientHeight;
    }
  }, [curIdx, filtered]);
  const labels: Record<"all" | "labeled" | "unlabeled", string> = {
    all: t("All images"), labeled: t("Labeled"), unlabeled: t("Unlabeled"),
  };

  return (
    <div className="sidebar">
      <div className="list-head">
        <label className="field">
          <Icon name="search" size={15} className="ic" />
          <input placeholder={t("Search files…")} value={search}
            onChange={e => setSearch(e.target.value)} />
          {search && <button className="iconbtn sm" onClick={() => setSearch("")}><Icon name="x" size={13} /></button>}
        </label>
        <div className="filter-row" style={{ position: "relative" }}>
          <button className="btn btn-secondary sm"
            style={{ flex: 1, justifyContent: "space-between" }}
            onClick={() => setMenuOpen(!menuOpen)}>
            <span className="row gap-sm" style={{ minWidth: 0 }}>
              <Icon name="filter" size={13} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {classFilter ? classFilter : labels[filter]}
              </span>
            </span>
            <Icon name="chevDown" size={13} />
          </button>
          {menuOpen && (
            <div className="dropmenu" style={{ top: "110%", left: 0, right: 0, maxHeight: 360, overflowY: "auto" }}>
              <div className="cmdk-group">{t("Status")}</div>
              {(["all", "labeled", "unlabeled"] as const).map(f => (
                <div key={f} className="menu-item" onClick={() => { setFilter(f); setMenuOpen(false); }}>
                  <Icon name={filter === f ? "check" : "dot"} size={14}
                    style={{ opacity: filter === f ? 1 : 0 }} />
                  <span>{labels[f]}</span>
                </div>
              ))}
              {classes.length > 0 && (
                <>
                  <div className="cmdk-group">{t("Class")}</div>
                  <div className="menu-item" onClick={() => { setClassFilter(null); setMenuOpen(false); }}>
                    <Icon name={!classFilter ? "check" : "dot"} size={14}
                      style={{ opacity: !classFilter ? 1 : 0 }} />
                    <span>{t("All classes")}</span>
                  </div>
                  {classes.map(c => (
                    <div key={c.id} className="menu-item"
                      onClick={() => { setClassFilter(c.name); setMenuOpen(false); }}>
                      <Icon name={classFilter === c.name ? "check" : "dot"} size={14}
                        style={{ opacity: classFilter === c.name ? 1 : 0 }} />
                      <span style={{
                        width: 9, height: 9, borderRadius: 2,
                        background: c.color, flex: "none",
                      }} />
                      <span className="grow" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="scroll" ref={scrollRef} onScroll={e => setScrollTop(e.currentTarget.scrollTop)}>
        {loading ? Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="file-row">
            <div className="shimmer" style={{ width: 48, height: 36, borderRadius: 4 }} />
            <div className="grow col gap-sm">
              <div className="shimmer" style={{ height: 11, width: "70%" }} />
              <div className="shimmer" style={{ height: 9, width: "40%" }} />
            </div>
          </div>
        )) : (
          <div style={{ height: filtered.length * rowHeight, position: "relative" }}>
            {visible.map(({ im, i }, visibleIndex) => (
              <div key={im.id} className={"file-row" + (i === curIdx ? " active" : "")}
                style={{ position: "absolute", top: (start + visibleIndex) * rowHeight, left: 0, right: 0, height: rowHeight }}
                onClick={() => setCurIdx(i)}>
                <div className="thumb-wrap">
                  <Thumb src={im.thumb} label={im.name} className="thumb" />
                  {im.labeled && <span className="thumb-check"><Icon name="check" size={9} /></span>}
                </div>
                <div className="file-meta">
                  <div className="file-name">{im.name}</div>
                  <div className="file-sub">
                    {im.hydrated && im.labeled ? `${im.boxes.length} ${t("boxes")}` : im.hydrated ? t("unlabeled") : "…"} · {im.modified}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="list-foot">
        <span>{curIdx + 1}/{images.length} {t("images")}</span>
        <span>{labeledCount} {t("labeled")}</span>
      </div>
    </div>
  );
}

interface ToolRailProps {
  tool: "pointer" | "box";
  setTool: (t: "pointer" | "box") => void;
  zoom: number;
  setZoom: (v: number | ((z: number) => number)) => void;
  toggleInspector: () => void;
}
export function ToolRail({ tool, setTool, setZoom, toggleInspector }: ToolRailProps) {
  const Z = (f: number) => () => setZoom(z => Math.max(0.2, Math.min(8, +(z * f).toFixed(2))));
  return (
    <div className="overlay tool-rail">
      <Tip label={t("Pointer")} kbd="V"><button className={"iconbtn" + (tool === "pointer" ? " active" : "")} onClick={() => setTool("pointer")} aria-label="Pointer"><Icon name="pointer" size={16} /></button></Tip>
      <Tip label={t("Box")} kbd="B"><button className={"iconbtn" + (tool === "box" ? " active" : "")} onClick={() => setTool("box")} aria-label="Box"><Icon name="box" size={16} /></button></Tip>
      <div className="rail-sep" />
      <Tip label={t("Zoom in")} kbd="⌘+"><button className="iconbtn" onClick={Z(1.2)} aria-label="Zoom in"><Icon name="zoomIn" size={16} /></button></Tip>
      <Tip label={t("Zoom out")} kbd="⌘-"><button className="iconbtn" onClick={Z(0.83)} aria-label="Zoom out"><Icon name="zoomOut" size={16} /></button></Tip>
      <Tip label={t("Fit")} kbd="⌘0"><button className="iconbtn" onClick={() => setZoom(1)} aria-label="Fit"><Icon name="fit" size={16} /></button></Tip>
      <div className="rail-sep" />
      <Tip label={t("Toggle inspector")}><button className="iconbtn" onClick={toggleInspector} aria-label="Inspector"><Icon name="panel" size={16} /></button></Tip>
    </div>
  );
}

interface ChipBarProps {
  classes: ClassDef[];
  boxes: NBox[];
  activeClass: string;
  setActiveClass: (c: string) => void;
  onAddClass: () => void;
}
export function ChipBar({ classes, boxes, activeClass, setActiveClass, onAddClass }: ChipBarProps) {
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    boxes.forEach(b => { m[b.cls] = (m[b.cls] || 0) + 1; });
    return m;
  }, [boxes]);
  return (
    <div className="overlay chip-bar">
      {classes.map((c, i) => (
        <button key={c.id} className={"chip" + (activeClass === c.id ? " active" : "")}
          onClick={() => setActiveClass(c.id)}>
          <span className="dot" style={{ background: c.color }} />
          {c.name}
          {counts[c.name] ? <span className="cnt">{counts[c.name]}</span> : null}
          {i < 9 && <span className="kbd" style={{ minWidth: 14, height: 14, fontSize: 9 }}>{i + 1}</span>}
        </button>
      ))}
      <button className="chip" onClick={onAddClass} style={{ paddingLeft: 10, paddingRight: 10 }}>
        <Icon name="plus" size={13} />
      </button>
    </div>
  );
}

interface InspSectionProps {
  title: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}
function InspSection({ title, count, open, onToggle, children }: InspSectionProps) {
  return (
    <div className="insp-sec">
      <div className="insp-head" onClick={onToggle}>
        <span className="row gap-sm">
          <Icon name={open ? "chevDown" : "chevRight"} size={14} style={{ color: "var(--text-tertiary)" }} />
          <span className="t-body-strong">{title}</span>
          {count != null && <span className="badge pill-muted">{count}</span>}
        </span>
      </div>
      {open && <div className="insp-body">{children}</div>}
    </div>
  );
}

interface InspectorProps {
  boxes: NBox[];
  setBoxes: (updater: NBox[] | ((bs: NBox[]) => NBox[])) => void;
  selId: string | null;
  setSelId: (id: string | null) => void;
  classes: ClassDef[];
  classColor: (key: string) => string;
  classNameOf: (key: string) => string;
  image?: ImageItem;
  /** OBB mode — reveals the angle control. Off, the panel is unchanged. */
  obb?: boolean;
}
export function AnnotateInspector({
  boxes, setBoxes, selId, setSelId, classes, classColor, classNameOf, image, obb = false,
}: InspectorProps) {
  const [o, setO] = useState({ sel: true, ann: true, help: true });
  const tog = (k: keyof typeof o) => setO(s => ({ ...s, [k]: !s[k] }));
  const sel = boxes.find(b => b.id === selId);
  const imgW = image?.w ?? 1280;
  const imgH = image?.h ?? 853;
  const px = (v: number, dim: number) => Math.round(v * dim);
  const setCoord = (key: "x" | "y" | "w" | "h", val: string, dim: number) => {
    const parsed = parseFloat(val); if (isNaN(parsed)) return;
    const n = parsed / dim;
    // Clamp the whole rect, not just the edited field: clamping x and w
    // independently to [0,1] still allowed x + w > 1, i.e. a box hanging off
    // the right/bottom edge that then got written with out-of-range pixels.
    setBoxes(bs => bs.map(b => b.id === selId ? { ...b, ...clampRect({ ...b, [key]: n }) } : b));
  };
  const delBox = (id: string) => {
    setBoxes(bs => bs.filter(b => b.id !== id));
    if (id === selId) setSelId(null);
  };
  // Angle is stored in radians but only ever shown in degrees — nobody labels
  // a defect in radians. Folded to (-90°, 90°] so spinning a box does not walk
  // the number off to 450°.
  const setAngleDeg = (deg: number) => {
    if (!Number.isFinite(deg)) return;
    setBoxes(bs => bs.map(b => b.id === selId ? { ...b, r: normalizeAngle(toRad(deg)) } : b));
  };
  const selDeg = sel ? Math.round(toDeg(sel.r ?? 0) * 10) / 10 : 0;

  return (
    <div className="inspector">
      <div className="scroll" style={{ flex: 1 }}>
        <InspSection title={t("Selected box")} open={o.sel} onToggle={() => tog("sel")}>
          {sel ? (
            <div className="col gap-md">
              <div className="row gap-sm">
                <span className="section-label" style={{ flex: 1 }}>{t("Class")}</span>
              </div>
              <div className="row gap-sm" style={{ flexWrap: "wrap" }}>
                <select className="field" style={{ flex: 1, appearance: "none" }} value={classNameOf(sel.cls)}
                  onChange={e => setBoxes(bs => bs.map(b => b.id === selId ? { ...b, cls: e.target.value } : b))}>
                  {classes.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
                <span className="cbx" style={{ background: classColor(sel.cls), boxShadow: "none", width: 32 }} />
              </div>
              <div className="coord-grid">
                {([
                  ["x", "X1", sel.x, imgW],
                  ["y", "Y1", sel.y, imgH],
                  ["w", "W", sel.w, imgW],
                  ["h", "H", sel.h, imgH],
                ] as const).map(([k, lab, v, dim]) => (
                  <div className="coord-cell" key={k}>
                    <label>{lab}</label>
                    <label className="field">
                      <input type="number" value={px(v, dim)}
                        onChange={e => setCoord(k, e.target.value, dim)} />
                    </label>
                  </div>
                ))}
              </div>
              {obb && (
                <div className="col gap-sm">
                  <span className="section-label">{t("Angle")}</span>
                  <div className="row gap-sm">
                    <input type="range" min={-90} max={90} step={0.5} value={selDeg}
                      style={{ flex: 1 }}
                      onChange={e => setAngleDeg(parseFloat(e.target.value))} />
                    <label className="field" style={{ width: 76 }}>
                      <input type="number" min={-90} max={90} step={1} value={selDeg}
                        onChange={e => setAngleDeg(parseFloat(e.target.value))} />
                      <span className="t-caption">°</span>
                    </label>
                    <Tip label={t("Reset angle")} kbd="R">
                      <button className="iconbtn sm" onClick={() => setAngleDeg(0)}>
                        <Icon name="refresh" size={14} />
                      </button>
                    </Tip>
                  </div>
                  <span className="t-caption">{t("Q/E turn 1°, A/D turn 5°, Shift while dragging the knob snaps to 15°")}</span>
                </div>
              )}
              <button className="btn btn-secondary sm" style={{ color: "var(--danger)" }} onClick={() => delBox(sel.id)}>
                <Icon name="trash" size={14} />{t("Delete box")}
                <span className="kbd" style={{ marginLeft: "auto" }}>Del</span>
              </button>
            </div>
          ) : (
            <div className="t-caption" style={{ padding: "4px 0" }}>
              {t("No box selected. Click a box on the canvas, or draw one with the box tool.")}
            </div>
          )}
        </InspSection>

        <InspSection title={t("Annotations")} count={boxes.length} open={o.ann} onToggle={() => tog("ann")}>
          {boxes.length ? (
            <div className="col" style={{ gap: 1 }}>
              {boxes.map(b => (
                <div key={b.id} className={"ann-row" + (b.id === selId ? " sel" : "")}
                  onClick={() => setSelId(b.id)}>
                  <Icon name="grip" size={14} className="grip" />
                  <span className="dot" style={{
                    width: 9, height: 9, borderRadius: 2,
                    background: classColor(b.cls), flex: "none",
                  }} />
                  <span className="t-body grow" style={{
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>{classNameOf(b.cls)}</span>
                  <span className="t-caption mono">
                    {Math.round(b.w * imgW)}×{Math.round(b.h * imgH)}
                    {obb && b.r ? ` · ${Math.round(toDeg(b.r))}°` : ""}
                  </span>
                  <button className="iconbtn sm del" onClick={(e) => {
                    e.stopPropagation();
                    setBoxes(bs => bs.filter(x => x.id !== b.id));
                    if (b.id === selId) setSelId(null);
                  }}>
                    <Icon name="trash" size={13} />
                  </button>
                </div>
              ))}
            </div>
          ) : <div className="t-caption" style={{ padding: "4px 0" }}>{t("No annotations yet.")}</div>}
        </InspSection>

        <InspSection title={t("Quick help")} open={o.help} onToggle={() => tog("help")}>
          <div className="col">
            {SHORTCUTS.map((s, i) => (
              <div className="help-row" key={i}>
                <span>{t(s.label)}</span><KbdGroup keys={s.keys} />
              </div>
            ))}
          </div>
        </InspSection>
      </div>
    </div>
  );
}
