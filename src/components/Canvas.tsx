import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { Img } from "./ui";
import { t } from "../i18n";
import { isDrawable, makeBox } from "../lib/boxes";
import {
  angleFromPointer, clampIntoImage, normalizeAngle, resizeRotated, snapAngle, toDeg,
} from "../lib/obb";
import { flagText } from "../lib/review";
import type { ImageItem, NBox } from "../types";
import type { ReviewFlag } from "../electron-api";

type SetBoxes = (updater: NBox[] | ((bs: NBox[]) => NBox[])) => void;

// Monotonic per-session counter so two boxes drawn in the same millisecond can
// never share an id. Colliding ids made React reuse DOM nodes and made "delete
// this box" remove the wrong one (or both) — the "can't delete" report.
let boxSeq = 0;
const newBoxId = () => `b_${Date.now().toString(36)}_${(boxSeq++).toString(36)}`;

interface ToastBody { icon?: string; msg: string; }

interface CanvasProps {
  image: ImageItem | undefined;
  boxes: NBox[];
  setBoxes: SetBoxes;
  selId: string | null;
  setSelId: (id: string | null) => void;
  tool: "pointer" | "box";
  activeClass: string;
  /** Name of the active class — boxes are stamped with the class NAME, not its id. */
  activeClassName: string;
  /**
   * OBB mode. Off (the default) the canvas behaves exactly as it always has:
   * no rotation knob, and drags use the plain axis-aligned math. Existing
   * rotations still RENDER when off, so turning the mode off never makes a
   * box look like something other than what will be written to disk.
   */
  obb?: boolean;
  zoom: number;
  setZoom: (v: number | ((z: number) => number)) => void;
  classColor: (key: string) => string;
  /** Resolve a box's class key (name or legacy id) to its display name. */
  classNameOf: (key: string) => string;
  onContext: (e: React.MouseEvent, b: NBox) => void;
  pushToast?: (t: ToastBody) => void;
  /** An audit's flags for this image, drawn as dashed marks that never take a click. */
  hints?: ReviewFlag[];
  /** Class names the flags' class indices refer to. */
  hintNames?: string[];
  fa?: boolean;
}

interface DragState {
  mode: "draw" | "move" | "resize" | "rotate" | "pan";
  ox: number;
  oy: number;
  id?: string;
  handle?: string;
  start?: NBox;
  startPan?: { x: number; y: number };
  /** Rotate only: angle between the knob and the pointer when the drag began,
   *  so grabbing the knob off-centre does not snap the box round to meet it. */
  grabOffset?: number;
}

export function CanvasStage({
  image, boxes, setBoxes, selId, setSelId, tool, activeClass, activeClassName,
  obb = false, zoom, setZoom, classColor, classNameOf, onContext, pushToast,
  hints, hintNames = [], fa = false,
}: CanvasProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [rubber, setRubber] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  // Mirror the rubber rect in a ref so the pointer-up handler can read the
  // final rectangle synchronously WITHOUT doing side effects inside a state
  // updater. Performing setBoxes()/pushToast() inside a setRubber(updater) made
  // those run twice under React StrictMode (which double-invokes updaters in
  // dev), so a single drawn box was committed twice — the duplicate-box bug.
  const rubberRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const drag = useRef<DragState | null>(null);
  const [popId, setPopId] = useState<string | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  // Aspect measured from the actually-decoded <img> (naturalWidth/Height).
  // The header-parsed image.w/image.h can be wrong/swapped for some formats,
  // and objectFit:"fill" would then stretch the picture (most visible when
  // zoomed in). The real decoded dims are authoritative for display.
  const [measuredAspect, setMeasuredAspect] = useState<number | null>(null);

  const aspect = measuredAspect ?? (image && image.w > 0 && image.h > 0 ? image.w / image.h : 1.5);
  const baseW = 720;
  const dispW = baseW * zoom;
  const dispH = dispW / aspect;
  // The pointer-up handler lives in an effect that does not re-run on zoom, so
  // mirror the current display size in a ref for it to read a fresh value.
  const dispRef = useRef({ w: dispW, h: dispH });
  dispRef.current = { w: dispW, h: dispH };

  // Reference frame for every rotation calculation. A box's angle is only
  // meaningful in IMAGE-PIXEL space — normalized units divide x and y by
  // different numbers, so an angle expressed there would shear the box on any
  // non-square image.
  //
  // These must be the image's OWN dimensions rather than the on-screen ones:
  // the main process re-derives the corners from `readImageDims`, so an angle
  // measured against any other aspect would be written out skewed. Fall back to
  // the display size only while an image is still unhydrated (w/h = 0), where
  // scale cancels out anyway and the alternative is dividing by zero.
  const geomRef = useRef({ w: 1, h: 1 });
  geomRef.current = image && image.w > 0 && image.h > 0
    ? { w: image.w, h: image.h }
    : { w: dispW || 1, h: dispH || 1 };

  const norm = (clientX: number, clientY: number) => {
    if (!wrapRef.current) return { x: 0, y: 0 };
    const r = wrapRef.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (clientY - r.top) / r.height)),
    };
  };

  const onStageDown = (e: React.PointerEvent) => {
    // Middle mouse always pans (works in both tools).
    if (e.button === 1) {
      drag.current = {
        mode: "pan", ox: e.clientX, oy: e.clientY,
        startPan: { ...pan },
      };
      setPanning(true);
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    // Smart/auto behavior: any left-down that reaches the stage is on empty
    // image area (box/handle downs call stopPropagation), so it always starts a
    // rubber-band draw — regardless of the active tool. A plain click (no real
    // drag) just deselects, because up() only commits a box past the threshold.
    const p = norm(e.clientX, e.clientY);
    setSelId(null);
    drag.current = { mode: "draw", ox: p.x, oy: p.y };
    rubberRef.current = { x: p.x, y: p.y, w: 0, h: 0 };
    setRubber(rubberRef.current);
    e.preventDefault();
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const r = stage.getBoundingClientRect();
    const pointerX = e.clientX - (r.left + r.width / 2);
    const pointerY = e.clientY - (r.top + r.height / 2);
    const factor = Math.exp(-e.deltaY * 0.0015);
    const next = Math.max(0.2, Math.min(8, zoom * factor));
    if (next === zoom) return;
    const ratio = next / zoom;
    setPan(current => ({
      x: pointerX - (pointerX - current.x) * ratio,
      y: pointerY - (pointerY - current.y) * ratio,
    }));
    setZoom(next);
  };

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
    // image?.id is required: on first mount `image` is undefined and the empty
    // state renders WITHOUT stageRef, so the listener never attaches. Re-run
    // once the real stage (with the ref) mounts so wheel-zoom works immediately
    // — without it, scroll-zoom only starts after the zoom buttons change zoom.
  }, [zoom, setZoom, image?.id]);

  const resetView = () => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
  };

  useEffect(() => {
    setPan({ x: 0, y: 0 });
    setMeasuredAspect(null);
  }, [image?.id]);

  const startBox = (e: React.PointerEvent, box: NBox, handle?: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setSelId(box.id);
    const p = norm(e.clientX, e.clientY);
    drag.current = {
      mode: handle ? "resize" : "move",
      handle, id: box.id, start: { ...box },
      ox: p.x, oy: p.y,
    };
    e.preventDefault();
  };

  const startRotate = (e: React.PointerEvent, box: NBox) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setSelId(box.id);
    const p = norm(e.clientX, e.clientY);
    const g = geomRef.current;
    drag.current = {
      mode: "rotate", id: box.id, start: { ...box },
      ox: p.x, oy: p.y,
      // Remember where on the knob the grab landed, so the box turns WITH the
      // pointer instead of jumping to put the knob under it.
      grabOffset: normalizeAngle(angleFromPointer(box, p, g.w, g.h) - (box.r ?? 0)),
    };
    e.preventDefault();
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current; if (!d) return;
      if (d.mode === "pan" && d.startPan) {
        setPan({
          x: d.startPan.x + e.clientX - d.ox,
          y: d.startPan.y + e.clientY - d.oy,
        });
        return;
      }
      const p = norm(e.clientX, e.clientY);
      if (d.mode === "draw") {
        const next = {
          x: Math.min(d.ox, p.x), y: Math.min(d.oy, p.y),
          w: Math.abs(p.x - d.ox), h: Math.abs(p.y - d.oy),
        };
        rubberRef.current = next;
        setRubber(next);
      } else if (d.mode === "move" && d.start && d.id) {
        const dx = p.x - d.ox, dy = p.y - d.oy;
        const s = d.start;
        const g = geomRef.current;
        // Keep the box's ROTATED footprint on the image. For an unrotated box
        // this is the same `x + w <= 1` clamp as before.
        const { x: nx, y: ny } = clampIntoImage({ ...s, x: s.x + dx, y: s.y + dy }, g.w, g.h);
        setBoxes(bs => bs.map(b => b.id === d.id ? { ...b, x: nx, y: ny } : b));
      } else if (d.mode === "rotate" && d.start && d.id) {
        const g = geomRef.current;
        // The centre does not move while rotating, so measuring against the
        // drag's starting box stays correct for the whole gesture.
        const raw = angleFromPointer(d.start, p, g.w, g.h) - (d.grabOffset ?? 0);
        const next = e.shiftKey ? snapAngle(raw, 15) : normalizeAngle(raw);
        setBoxes(bs => bs.map(b => b.id === d.id ? { ...b, r: next } : b));
      } else if (d.mode === "resize" && d.start && d.id && d.handle) {
        const s = d.start; const h = d.handle;
        if (s.r) {
          // Rotated: pin the opposite corner and measure the drag along the
          // box's own axes, so the grabbed corner tracks the pointer instead of
          // sliding sideways.
          const g = geomRef.current;
          const next = resizeRotated(s, h, p, g.w, g.h);
          setBoxes(bs => bs.map(b => b.id === d.id ? { ...b, ...next } : b));
        } else {
          let x1 = s.x, y1 = s.y, x2 = s.x + s.w, y2 = s.y + s.h;
          if (h.includes("w")) x1 = Math.min(p.x, x2 - 0.01);
          if (h.includes("e")) x2 = Math.max(p.x, x1 + 0.01);
          if (h.includes("n")) y1 = Math.min(p.y, y2 - 0.01);
          if (h.includes("s")) y2 = Math.max(p.y, y1 + 0.01);
          setBoxes(bs => bs.map(b => b.id === d.id ? { ...b, x: x1, y: y1, w: x2 - x1, h: y2 - y1 } : b));
        }
      }
    };
    const up = () => {
      const d = drag.current;
      if (d && d.mode === "draw") {
        // Read the final rect from the ref and do all side effects OUTSIDE any
        // state updater so StrictMode's double-invocation can't add it twice.
        const r = rubberRef.current;
        // Threshold is ~4 on-screen pixels, converted to normalized units for
        // each axis. This keeps a plain click from creating a box, while letting
        // the user draw tiny boxes (zooming in shrinks the normalized minimum),
        // instead of the old fixed 2%-of-image floor that blocked small objects.
        const { w: dw, h: dh } = dispRef.current;
        const minW = dw > 0 ? 4 / dw : 0.004;
        const minH = dh > 0 ? 4 / dh : 0.004;
        if (isDrawable(r, minW, minH)) {
          const id = newBoxId();
          setBoxes(bs => [...bs, makeBox(r, activeClassName, id)]);
          setSelId(id); setPopId(id);
          setTimeout(() => setPopId(null), 120);
          pushToast?.({ icon: "box", msg: `Box added · ${activeClassName}` });
        }
        rubberRef.current = null;
        setRubber(null);
      }
      if (d?.mode === "pan") setPanning(false);
      drag.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [activeClassName, setBoxes, setSelId, pushToast]);

  if (!image) {
    return (
      <div className="canvas-stage">
        <div className="empty">
          <div style={{
            width: 96, height: 96, borderRadius: 20,
            background: "var(--surface)", display: "flex",
            alignItems: "center", justifyContent: "center",
            boxShadow: "inset 0 0 0 1px var(--border)",
          }}>
            <Icon name="images" size={40} style={{ color: "var(--text-tertiary)" }} />
          </div>
          <div className="t-title">{t("No images in this project")}</div>
          <div className="t-body tsec" style={{ maxWidth: 300 }}>
            {t("Drop a folder of images here, or add them from disk to start labeling.")}
          </div>
          <button className="btn btn-primary"><Icon name="plus" size={15} />{t("Add images")}</button>
        </div>
      </div>
    );
  }

  const handles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
  return (
    <div className="canvas-stage" ref={stageRef} onPointerDown={onStageDown}
      onDoubleClick={resetView} onAuxClick={e => e.preventDefault()}
      style={{ cursor: panning ? "grabbing" : "crosshair" }}>
      <div className="canvas-inner">
        <div className="canvas-img-wrap" ref={wrapRef} style={{
          width: dispW, height: dispH,
          transform: `translate(${pan.x}px, ${pan.y}px)`,
        }}>
          <Img src={image.url} label={image.name}
            onLoad={(e) => {
              const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
              if (w > 0 && h > 0) setMeasuredAspect(w / h);
            }}
            style={{ width: "100%", height: "100%", objectFit: "fill" }} />
          {boxes.map(b => {
            const col = classColor(b.cls);
            const sel = b.id === selId;
            const rot = b.r ?? 0;
            return (
              <div key={b.id}
                className={"box" + (sel ? " sel" : "") + (b.id === popId ? " pop" : "")}
                style={{
                  left: b.x * 100 + "%", top: b.y * 100 + "%",
                  width: b.w * 100 + "%", height: b.h * 100 + "%",
                  borderColor: col, zIndex: sel ? 4 : 2,
                  // The wrapper scales both axes by the same factor (it keeps
                  // the image's aspect ratio), so a CSS rotation on screen is a
                  // true rotation in image space. Handles are children, so they
                  // ride along and hit-testing follows the turned shape for
                  // free — no bespoke point-in-rotated-rect maths needed.
                  transform: rot ? `rotate(${rot}rad)` : undefined,
                  // Box tool = force-draw: let the down bubble to the stage so a
                  // new box can be drawn over this one. Pointer tool = select.
                  cursor: tool === "box" ? "crosshair" : "move",
                }}
                onPointerDown={(e) => { if (tool === "pointer") startBox(e, b); }}
                onContextMenu={(e) => { e.preventDefault(); onContext(e, b); }}>
                <div className="box-fill" style={{ background: col }} />
                <div className="box-label" style={{
                  background: col,
                  // Cancel the box's rotation so the class name stays readable
                  // instead of ending up upside-down on a steeply turned box.
                  transform: rot ? `rotate(${-rot}rad)` : undefined,
                  transformOrigin: "0 100%",
                }}>
                  {classNameOf(b.cls)}
                  {obb && rot ? <span className="box-angle">{Math.round(toDeg(rot))}°</span> : null}
                </div>
                {sel && tool === "pointer" && handles.map(h => (
                  <div key={h} className={"handle " + h} style={{ borderColor: col }}
                    onPointerDown={(e) => startBox(e, b, h)} />
                ))}
                {sel && tool === "pointer" && obb && (
                  <>
                    <div className="rot-stem" style={{ background: col }} />
                    <div className="handle rot" style={{ borderColor: col }}
                      title={t("Drag to rotate · hold Shift to snap to 15°")}
                      onPointerDown={(e) => startRotate(e, b)} />
                  </>
                )}
              </div>
            );
          })}
          {hints?.map((f, i) => (
            <div key={`hint-${i}`} className={"hint hint-" + f.kind.replace(" ", "-")} style={{
              left: f.box[0] * 100 + "%", top: f.box[1] * 100 + "%",
              width: (f.box[2] - f.box[0]) * 100 + "%", height: (f.box[3] - f.box[1]) * 100 + "%",
            }}>
              <span className="hint-label">{flagText(f, hintNames, fa)}</span>
              {f.inner && (
                <div className="hint-inner" style={{
                  left: (f.inner[0] - f.box[0]) / (f.box[2] - f.box[0]) * 100 + "%",
                  top: (f.inner[1] - f.box[1]) / (f.box[3] - f.box[1]) * 100 + "%",
                  width: (f.inner[2] - f.inner[0]) / (f.box[2] - f.box[0]) * 100 + "%",
                  height: (f.inner[3] - f.inner[1]) / (f.box[3] - f.box[1]) * 100 + "%",
                }} />
              )}
            </div>
          ))}
          {rubber && (
            <div className="rubber" style={{
              left: rubber.x * 100 + "%", top: rubber.y * 100 + "%",
              width: rubber.w * 100 + "%", height: rubber.h * 100 + "%",
            }} />
          )}
        </div>
      </div>
    </div>
  );
}
