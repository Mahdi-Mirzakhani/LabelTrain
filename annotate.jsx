/* ============================================================
   annotate.jsx — Annotate route: file list, overlays, inspector
   ============================================================ */
const { useState: useStateA, useMemo: useMemoA } = React;

/* ---------- File list sidebar ---------- */
function FileList({ images, curIdx, setCurIdx, search, setSearch, filter, setFilter, loading }) {
  const [menuOpen, setMenuOpen] = useStateA(false);
  const filtered = useMemoA(() => images
    .map((im, i) => ({ im, i }))
    .filter(({ im }) => im.name.toLowerCase().includes(search.toLowerCase()))
    .filter(({ im }) => filter === "all" || (filter === "labeled" ? im.labeled : !im.labeled)),
    [images, search, filter]);
  const labeledCount = images.filter(i => i.labeled).length;
  const fLabel = { all:t("All images"), labeled:t("Labeled"), unlabeled:t("Unlabeled") }[filter];

  return (
    <div className="sidebar">
      <div className="list-head">
        <label className="field">
          <Icon name="search" size={15} className="ic" />
          <input placeholder={t("Search files…")} value={search} onChange={e=>setSearch(e.target.value)} />
          {search && <button className="iconbtn sm" onClick={()=>setSearch("")}><Icon name="x" size={13} /></button>}
        </label>
        <div className="filter-row" style={{ position:"relative" }}>
          <button className="btn btn-secondary sm" style={{ flex:1, justifyContent:"space-between" }} onClick={()=>setMenuOpen(v=>!v)}>
            <span className="row gap-sm"><Icon name="filter" size={13} />{fLabel}</span>
            <Icon name="chevDown" size={13} />
          </button>
          {menuOpen && (
            <div className="dropmenu" style={{ top:"110%", left:0, right:0 }}>
              {["all","labeled","unlabeled"].map(f => (
                <div key={f} className="menu-item" onClick={()=>{setFilter(f);setMenuOpen(false);}}>
                  <Icon name={filter===f?"check":"dot"} size={14} style={{ opacity: filter===f?1:0 }} />
                  <span>{{all:t("All images"),labeled:t("Labeled"),unlabeled:t("Unlabeled")}[f]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="scroll">
        {loading ? Array.from({length:8}).map((_,i)=>(
          <div key={i} className="file-row">
            <div className="shimmer" style={{ width:48, height:36, borderRadius:4 }} />
            <div className="grow col gap-sm">
              <div className="shimmer" style={{ height:11, width:"70%" }} />
              <div className="shimmer" style={{ height:9, width:"40%" }} />
            </div>
          </div>
        )) : filtered.map(({ im, i }) => (
          <div key={im.id} className={"file-row" + (i===curIdx ? " active" : "")} onClick={()=>setCurIdx(i)}>
            <div className="thumb-wrap">
              <Img src={im.thumb} label={im.name} className="thumb" />
              {im.labeled && <span className="thumb-check"><Icon name="check" size={9} /></span>}
            </div>
            <div className="file-meta">
              <div className="file-name">{im.name}</div>
              <div className="file-sub">{im.labeled ? `${im.boxes.length} ${t("boxes")}` : t("unlabeled")} · {im.modified}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="list-foot">
        <span>{curIdx+1}/{images.length} {t("images")}</span>
        <span>{labeledCount} {t("labeled")}</span>
      </div>
    </div>
  );
}

/* ---------- Tool rail (floating) ---------- */
function ToolRail({ tool, setTool, zoom, setZoom, toggleInspector }) {
  const Z = (f) => () => setZoom(z => Math.max(0.4, Math.min(3, +(z*f).toFixed(2))));
  return (
    <div className="overlay tool-rail">
      <Tip label={t("Pointer")} kbd="V"><button className={"iconbtn"+(tool==="pointer"?" active":"")} onClick={()=>setTool("pointer")} aria-label="Pointer"><Icon name="pointer" size={16} /></button></Tip>
      <Tip label={t("Box")} kbd="B"><button className={"iconbtn"+(tool==="box"?" active":"")} onClick={()=>setTool("box")} aria-label="Box"><Icon name="box" size={16} /></button></Tip>
      <div className="rail-sep" />
      <Tip label={t("Zoom in")} kbd="⌘+"><button className="iconbtn" onClick={Z(1.2)} aria-label="Zoom in"><Icon name="zoomIn" size={16} /></button></Tip>
      <Tip label={t("Zoom out")} kbd="⌘-"><button className="iconbtn" onClick={Z(0.83)} aria-label="Zoom out"><Icon name="zoomOut" size={16} /></button></Tip>
      <Tip label={t("Fit")} kbd="⌘0"><button className="iconbtn" onClick={()=>setZoom(1)} aria-label="Fit"><Icon name="fit" size={16} /></button></Tip>
      <div className="rail-sep" />
      <Tip label={t("Toggle inspector")}><button className="iconbtn" onClick={toggleInspector} aria-label="Inspector"><Icon name="panel" size={16} /></button></Tip>
    </div>
  );
}

/* ---------- Class chip bar (floating, bottom-center) ---------- */
function ChipBar({ classes, boxes, activeClass, setActiveClass, onAddClass }) {
  const counts = useMemoA(() => {
    const m = {}; boxes.forEach(b => m[b.cls] = (m[b.cls]||0)+1); return m;
  }, [boxes]);
  return (
    <div className="overlay chip-bar">
      {classes.map((c, i) => (
        <button key={c.id} className={"chip"+(activeClass===c.id?" active":"")} onClick={()=>setActiveClass(c.id)}>
          <span className="dot" style={{ background:c.color }} />
          {c.name}
          {counts[c.id] ? <span className="cnt">{counts[c.id]}</span> : null}
          {i < 9 && <span className="kbd" style={{ minWidth:14, height:14, fontSize:9 }}>{i+1}</span>}
        </button>
      ))}
      <button className="chip" onClick={onAddClass} style={{ paddingLeft:10, paddingRight:10 }}><Icon name="plus" size={13} /></button>
    </div>
  );
}

/* ---------- Inspector (right) ---------- */
function InspSection({ title, count, open, onToggle, children }) {
  return (
    <div className="insp-sec">
      <div className="insp-head" onClick={onToggle}>
        <span className="row gap-sm">
          <Icon name={open?"chevDown":"chevRight"} size={14} style={{ color:"var(--text-tertiary)" }} />
          <span className="t-body-strong">{title}</span>
          {count!=null && <span className="badge pill-muted">{count}</span>}
        </span>
      </div>
      {open && <div className="insp-body">{children}</div>}
    </div>
  );
}

function AnnotateInspector({ boxes, setBoxes, selId, setSelId, classes, classColor }) {
  const [o, setO] = useStateA({ sel:true, ann:true, help:true });
  const tog = (k) => setO(s => ({ ...s, [k]:!s[k] }));
  const sel = boxes.find(b => b.id === selId);
  const img = { w:1280, h:853 };
  const px = (v, dim) => Math.round(v * dim);
  const setCoord = (key, val, dim) => {
    const t = parseFloat(val); if (isNaN(t)) return;
    const n = t / dim;
    setBoxes(bs => bs.map(b => b.id === selId ? { ...b, [key]: Math.max(0, Math.min(1, n)) } : b));
  };
  const delBox = (id) => { setBoxes(bs => bs.filter(b => b.id !== id)); if (id===selId) setSelId(null); };

  return (
    <div className="inspector">
      <div className="scroll" style={{ flex:1 }}>
        <InspSection title={t("Selected box")} open={o.sel} onToggle={()=>tog("sel")}>
          {sel ? (
            <div className="col gap-md">
              <div className="row gap-sm">
                <span className="section-label" style={{ flex:1 }}>{t("Class")}</span>
              </div>
              <div className="row gap-sm" style={{ flexWrap:"wrap" }}>
                <select className="field" style={{ flex:1, appearance:"none" }} value={sel.cls}
                  onChange={e=>setBoxes(bs=>bs.map(b=>b.id===selId?{...b,cls:e.target.value}:b))}>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <span className="cbx" style={{ background:classColor(sel.cls), boxShadow:"none", width:32 }} />
              </div>
              <div className="coord-grid">
                {[["x","X1",sel.x,img.w],["y","Y1",sel.y,img.h],
                  ["w","W",sel.w,img.w],["h","H",sel.h,img.h]].map(([k,lab,v,dim]) => (
                  <div className="coord-cell" key={k}>
                    <label>{lab}</label>
                    <label className="field"><input type="number" value={px(v,dim)} onChange={e=>setCoord(k,e.target.value,dim)} /></label>
                  </div>
                ))}
              </div>
              <button className="btn btn-secondary sm" style={{ color:"var(--danger)" }} onClick={()=>delBox(sel.id)}>
                <Icon name="trash" size={14} />{t("Delete box")}<span className="kbd" style={{ marginLeft:"auto" }}>Del</span>
              </button>
            </div>
          ) : <div className="t-caption" style={{ padding:"4px 0" }}>{t("No box selected. Click a box on the canvas, or draw one with the box tool.")}</div>}
        </InspSection>

        <InspSection title={t("Annotations")} count={boxes.length} open={o.ann} onToggle={()=>tog("ann")}>
          {boxes.length ? (
            <div className="col" style={{ gap:1 }}>
              {boxes.map(b => (
                <div key={b.id} className={"ann-row"+(b.id===selId?" sel":"")} onClick={()=>setSelId(b.id)}>
                  <Icon name="grip" size={14} className="grip" />
                  <span className="dot" style={{ width:9, height:9, borderRadius:2, background:classColor(b.cls), flex:"none" }} />
                  <span className="t-body grow" style={{ whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{b.cls}</span>
                  <span className="t-caption mono">{Math.round(b.w*1280)}×{Math.round(b.h*853)}</span>
                  <button className="iconbtn sm del" onClick={(e)=>{e.stopPropagation();setBoxes(bs=>bs.filter(x=>x.id!==b.id));if(b.id===selId)setSelId(null);}}><Icon name="trash" size={13} /></button>
                </div>
              ))}
            </div>
          ) : <div className="t-caption" style={{ padding:"4px 0" }}>{t("No annotations yet.")}</div>}
        </InspSection>

        <InspSection title={t("Quick help")} open={o.help} onToggle={()=>tog("help")}>
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

Object.assign(window, { FileList, ToolRail, ChipBar, AnnotateInspector });
