/* ============================================================
   canvas.jsx — Konva-style annotation canvas (HTML impl)
   draw (rubber band), select, move, resize (8 handles)
   Boxes are normalized [x,y,w,h] in 0..1 of the image.
   ============================================================ */
const { useState: useStateC, useRef: useRefC, useEffect: useEffectC, useCallback: useCB } = React;

function CanvasStage({
  image, boxes, setBoxes, selId, setSelId, tool, activeClass,
  zoom, setZoom, classColor, onContext, pushToast,
}) {
  const stageRef = useRefC(null);
  const wrapRef = useRefC(null);
  const [rubber, setRubber] = useStateC(null);
  const drag = useRefC(null);
  const [popId, setPopId] = useStateC(null);

  const aspect = image ? image.w / image.h : 1.5;
  const baseW = 720;
  const dispW = baseW * zoom;
  const dispH = dispW / aspect;

  const norm = (clientX, clientY) => {
    const r = wrapRef.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (clientY - r.top) / r.height)),
      rw: r.width, rh: r.height,
    };
  };

  // ---- draw new box ----
  // Smart/auto behavior: a pointerdown that reaches the stage is always on
  // empty image area (box/handle downs call stopPropagation), so it always
  // starts a rubber-band draw — regardless of the active tool. A plain click
  // (no real drag) just deselects, because up() only commits a box past the
  // size threshold.
  const onStageDown = (e) => {
    if (e.button !== 0) return;
    const p = norm(e.clientX, e.clientY);
    setSelId(null);
    drag.current = { mode:"draw", ox:p.x, oy:p.y };
    setRubber({ x:p.x, y:p.y, w:0, h:0 });
    e.preventDefault();
  };

  // ---- start move / resize on existing box ----
  const startBox = (e, box, handle) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    setSelId(box.id);
    const p = norm(e.clientX, e.clientY);
    drag.current = { mode: handle ? "resize" : "move", handle, id: box.id, start: { ...box }, ox: p.x, oy: p.y };
    e.preventDefault();
  };

  useEffectC(() => {
    const move = (e) => {
      const d = drag.current; if (!d) return;
      const p = norm(e.clientX, e.clientY);
      if (d.mode === "draw") {
        setRubber({ x: Math.min(d.ox, p.x), y: Math.min(d.oy, p.y), w: Math.abs(p.x - d.ox), h: Math.abs(p.y - d.oy) });
      } else if (d.mode === "move") {
        const dx = p.x - d.ox, dy = p.y - d.oy; const s = d.start;
        const nx = Math.max(0, Math.min(1 - s.w, s.x + dx));
        const ny = Math.max(0, Math.min(1 - s.h, s.y + dy));
        setBoxes(bs => bs.map(b => b.id === d.id ? { ...b, x: nx, y: ny } : b));
      } else if (d.mode === "resize") {
        const s = d.start; const h = d.handle;
        let x1 = s.x, y1 = s.y, x2 = s.x + s.w, y2 = s.y + s.h;
        if (h.includes("w")) x1 = Math.min(p.x, x2 - 0.01);
        if (h.includes("e")) x2 = Math.max(p.x, x1 + 0.01);
        if (h.includes("n")) y1 = Math.min(p.y, y2 - 0.01);
        if (h.includes("s")) y2 = Math.max(p.y, y1 + 0.01);
        setBoxes(bs => bs.map(b => b.id === d.id ? { ...b, x:x1, y:y1, w:x2-x1, h:y2-y1 } : b));
      }
    };
    const up = () => {
      const d = drag.current;
      if (d && d.mode === "draw") {
        setRubber(r => {
          if (r && r.w > 0.02 && r.h > 0.02) {
            const id = "b_" + Date.now();
            setBoxes(bs => [...bs, { id, cls: activeClass, ...r }]);
            setSelId(id); setPopId(id); setTimeout(() => setPopId(null), 120);
            pushToast && pushToast({ icon:"box", msg:`Box added · ${activeClass}` });
          }
          return null;
        });
      }
      drag.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [activeClass, setBoxes, setSelId, pushToast]);

  if (!image) {
    return (
      <div className="canvas-stage">
        <div className="empty">
          <div style={{ width:96, height:96, borderRadius:20, background:"var(--surface)", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"inset 0 0 0 1px var(--border)" }}>
            <Icon name="images" size={40} style={{ color:"var(--text-tertiary)" }} />
          </div>
          <div className="t-title">{t("No images in this project")}</div>
          <div className="t-body tsec" style={{ maxWidth:300 }}>{t("Drop a folder of images here, or add them from disk to start labeling.")}</div>
          <button className="btn btn-primary"><Icon name="plus" size={15} />{t("Add images")}</button>
        </div>
      </div>
    );
  }

  const handles = ["nw","n","ne","e","se","s","sw","w"];
  return (
    <div className="canvas-stage" ref={stageRef} onPointerDown={onStageDown}
      style={{ cursor: "crosshair" }}>
      <div className="canvas-inner">
        <div className="canvas-img-wrap" ref={wrapRef} style={{ width: dispW, height: dispH }}>
          <Img src={image.url} label={image.name} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
          {boxes.map(b => {
            const col = classColor(b.cls);
            const sel = b.id === selId;
            return (
              <div key={b.id} className={"box" + (sel ? " sel" : "") + (b.id === popId ? " pop" : "")}
                style={{ left: b.x*100+"%", top: b.y*100+"%", width: b.w*100+"%", height: b.h*100+"%", borderColor: col, zIndex: sel ? 4 : 2, cursor: tool === "box" ? "crosshair" : "move" }}
                onPointerDown={(e) => { if (tool === "pointer") startBox(e, b); }}
                onContextMenu={(e) => { e.preventDefault(); onContext(e, b); }}>
                <div className="box-fill" style={{ background: col }} />
                <div className="box-label" style={{ background: col }}>{b.cls}</div>
                {sel && tool === "pointer" && handles.map(h => (
                  <div key={h} className={"handle " + h} style={{ borderColor: col }}
                    onPointerDown={(e) => startBox(e, b, h)} />
                ))}
              </div>
            );
          })}
          {rubber && <div className="rubber" style={{ left: rubber.x*100+"%", top: rubber.y*100+"%", width: rubber.w*100+"%", height: rubber.h*100+"%" }} />}
        </div>
      </div>
    </div>
  );
}

window.CanvasStage = CanvasStage;
