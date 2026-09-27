/* ============================================================
   modals.jsx — Command palette, Auto-Label, Split, Class Manager,
   Settings, Toasts, Context menu
   ============================================================ */
const { useState: useStateM, useEffect: useEffectM, useRef: useRefM, useMemo: useMemoM } = React;

/* ---------- Command palette ---------- */
function CommandPalette({ commands, onClose, onRun }) {
  const [q, setQ] = useStateM("");
  const [idx, setIdx] = useStateM(0);
  const inputRef = useRefM(null);
  useEffectM(() => { inputRef.current && inputRef.current.focus(); }, []);
  const filtered = useMemoM(() => {
    if (!q.trim()) return commands;
    const s = q.toLowerCase();
    // fuzzy: every char of query appears in order
    const fz = (t) => { let i=0; for (const ch of t.toLowerCase()) if (ch===s[i]) i++; return i===s.length; };
    return commands.filter(c => c.label.toLowerCase().includes(s) || fz(c.label) || (c.kw||"").includes(s));
  }, [q, commands]);
  useEffectM(() => setIdx(0), [q]);
  const groups = useMemoM(() => {
    const g = {}; filtered.forEach(c => { (g[c.group] = g[c.group] || []).push(c); }); return g;
  }, [filtered]);
  const flat = filtered;

  const key = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx(i => Math.min(flat.length-1, i+1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx(i => Math.max(0, i-1)); }
    else if (e.key === "Enter") { e.preventDefault(); flat[idx] && (onRun(flat[idx]), onClose()); }
    else if (e.key === "Escape") onClose();
  };
  let running = -1;
  return (
    <div className="scrim" onMouseDown={onClose}>
      <div className="cmdk" onMouseDown={e=>e.stopPropagation()}>
        <div className="cmdk-input">
          <Icon name="search" size={18} style={{ color:"var(--text-tertiary)" }} />
          <input ref={inputRef} value={q} onChange={e=>setQ(e.target.value)} onKeyDown={key} placeholder={t("Search commands, files, actions…")} />
          <span className="kbd">Esc</span>
        </div>
        <div className="cmdk-list">
          {flat.length===0 && <div className="cmdk-item" style={{ justifyContent:"center", color:"var(--text-tertiary)" }}>{t("No results")}</div>}
          {Object.entries(groups).map(([group, items]) => (
            <div key={group}>
              <div className="cmdk-group">{group}</div>
              {items.map(c => { running++; const on = running===idx; return (
                <div key={c.id} className={"cmdk-item"+(on?" on":"")} onMouseEnter={()=>setIdx(flat.indexOf(c))} onClick={()=>{onRun(c);onClose();}}>
                  <Icon name={c.icon} size={16} className="ic" />
                  <span>{c.label}</span>
                  {c.keys && <span className="meta">{c.keys.map((k,i)=><span key={i} className="kbd">{k}</span>)}</span>}
                </div>
              ); })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- Auto-Label modal ---------- */
function AutoLabelModal({ onClose, classes, pushToast }) {
  const [conf, setConf] = useStateM(0.25);
  const [iou, setIou] = useStateM(0.45);
  const [scope, setScope] = useStateM("current");
  const [addNew, setAddNew] = useStateM(true);
  const [search, setSearch] = useStateM("");
  const [picked, setPicked] = useStateM(() => new Set(["person","car","truck","bus"]));
  const list = MODEL_CLASSES.filter(c => c.includes(search.toLowerCase()));
  const toggle = (c) => setPicked(p => { const n = new Set(p); n.has(c)?n.delete(c):n.add(c); return n; });

  return (
    <div className="scrim" onMouseDown={onClose}>
      <div className="modal" onMouseDown={e=>e.stopPropagation()}>
        <div className="modal-head">
          <div className="row gap-md"><span className="cbx" style={{ background:"var(--primary)", boxShadow:"none", color:"#fff" }}><Icon name="sparkles" size={12}/></span>
            <div className="col"><span className="t-title">{t("Auto-label with YOLO")}</span><span className="t-caption">yolov8m.pt · 80 classes loaded</span></div></div>
          <button className="iconbtn" onClick={onClose}><Icon name="x" size={16}/></button>
        </div>
        <div className="modal-body" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"var(--sp-2xl)" }}>
          <div className="col" style={{ gap:"var(--sp-xl)" }}>
            <div className="col gap-md">
              <div className="row" style={{ justifyContent:"space-between" }}><span className="t-label">{t("Confidence")}</span><span className="mono tnum t-body">{conf.toFixed(2)}</span></div>
              <Slider value={conf} min={0.05} max={0.95} step={0.05} onChange={setConf} />
              <span className="t-caption">{t("Lower catches more objects but adds false positives.")}</span>
            </div>
            <div className="col gap-md">
              <div className="row" style={{ justifyContent:"space-between" }}><span className="t-label">{t("IoU threshold")}</span><span className="mono tnum t-body">{iou.toFixed(2)}</span></div>
              <Slider value={iou} min={0.10} max={0.95} step={0.05} onChange={setIou} />
              <span className="t-caption">{t("Higher keeps overlapping boxes; lower merges them.")}</span>
            </div>
            <div className="col gap-md">
              <span className="t-label">{t("Scope")}</span>
              <Segmented value={scope} onChange={setScope} options={[{value:"current",label:t("Current image")},{value:"batch",label:"All 480 images"}]} />
            </div>
            <div className="row" style={{ justifyContent:"space-between" }}>
              <div className="col"><span className="t-body">{t("Add detected classes to project")}</span><span className="t-caption">{t("Auto-extend the class list")}</span></div>
              <Switch on={addNew} onChange={setAddNew} />
            </div>
          </div>
          <div className="col gap-md" style={{ minHeight:0 }}>
            <span className="t-label">{t("Detect classes")} <span className="tter">({picked.size})</span></span>
            <label className="field"><Icon name="search" size={14} className="ic"/><input placeholder={t("Filter classes…")} value={search} onChange={e=>setSearch(e.target.value)} /></label>
            <div className="card" style={{ overflow:"auto", maxHeight:230, padding:"var(--sp-xs)" }}>
              {list.map(c => (
                <label key={c} className="row gap-md" style={{ padding:"6px var(--sp-sm)", borderRadius:"var(--r-sm)", cursor:"pointer" }} onClick={e=>{e.preventDefault();toggle(c);}}>
                  <span className={"cbx"+(picked.has(c)?" on":"")}>{picked.has(c)&&<Icon name="check" size={12}/>}</span>
                  <span className="t-body">{c}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>{t("Cancel")}</button>
          <button className="btn btn-primary" onClick={()=>{onClose();pushToast({icon:"sparkles",msg:`Auto-labeling ${scope==="batch"?"480 images":"current image"}…`});}}>
            <Icon name="sparkles" size={15}/>{t("Run auto-label")}</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Split modal ---------- */
function SplitModal({ onClose, pushToast }) {
  const [r, setR] = useStateM({ train:.7, val:.2, test:.1 });
  const [seed, setSeed] = useStateM(42);
  const [copy, setCopy] = useStateM(true);
  const set = (key,v)=>{ const o=["train","val","test"].filter(k=>k!==key); const rest=1-v; const s=r[o[0]]+r[o[1]]||1; setR({[key]:v,[o[0]]:+(rest*(r[o[0]]/s)).toFixed(2),[o[1]]:+(rest*(r[o[1]]/s)).toFixed(2)}); };
  return (
    <div className="scrim" onMouseDown={onClose}>
      <div className="modal" style={{ width:"min(520px,92vw)" }} onMouseDown={e=>e.stopPropagation()}>
        <div className="modal-head"><span className="t-title">{t("Train / Val / Test split")}</span><button className="iconbtn" onClick={onClose}><Icon name="x" size={16}/></button></div>
        <div className="modal-body col" style={{ gap:"var(--sp-xl)" }}>
          <div className="row gap-sm" style={{ height:12, borderRadius:6, overflow:"hidden" }}>
            <div style={{ flex:r.train, background:"var(--primary)" }} /><div style={{ flex:r.val, background:"var(--info)" }} /><div style={{ flex:r.test, background:"var(--warning)" }} />
          </div>
          {["train","val","test"].map(k=>(
            <div className="row gap-md" key={k}><span className="t-body" style={{ width:44, textTransform:"capitalize" }}>{k}</span>
              <Slider value={r[k]} min={0} max={1} step={0.05} onChange={v=>set(k,v)} /><span className="mono tnum t-body" style={{ width:38, textAlign:"right" }}>{Math.round(r[k]*100)}%</span></div>
          ))}
          <div className="coord-grid">
            <div className="coord-cell"><label>Random seed</label><label className="field"><input type="number" value={seed} onChange={e=>setSeed(+e.target.value)}/></label></div>
            <div className="coord-cell"><label>Output</label><label className="field"><Icon name="folder" size={14} className="ic"/><input defaultValue="./dataset"/></label></div>
          </div>
          <div className="row" style={{ justifyContent:"space-between" }}><span className="t-body">Copy images to split folders</span><Switch on={copy} onChange={setCopy}/></div>
        </div>
        <div className="modal-foot"><button className="btn btn-ghost" onClick={onClose}>{t("Cancel")}</button>
          <button className="btn btn-primary" onClick={()=>{onClose();pushToast({icon:"split",msg:"Dataset split exported"});}}><Icon name="split" size={15}/>{t("Export split")}</button></div>
      </div>
    </div>
  );
}

/* ---------- Class Manager drawer ---------- */
function ClassManagerDrawer({ onClose, classes, setClasses, pushToast }) {
  const palette = Object.values(PALETTE);
  const rename = (id, name) => setClasses(cs => cs.map(c => c.id===id?{...c,name}:c));
  const recolor = (id, color) => setClasses(cs => cs.map(c => c.id===id?{...c,color}:c));
  const del = (id) => setClasses(cs => cs.filter(c => c.id!==id));
  const [picker, setPicker] = useStateM(null);
  const add = () => setClasses(cs => [...cs, { id:"class_"+Date.now(), name:"new class", color:palette[cs.length%palette.length] }]);
  return (
    <div className="scrim" onMouseDown={onClose} style={{ justifyContent:"flex-end" }}>
      <div className="drawer" onMouseDown={e=>e.stopPropagation()}>
        <div className="drawer-head"><div className="col"><span className="t-title">{t("Classes")}</span><span className="t-caption">{classes.length} {t("classes")} · {t("drag to reorder")}</span></div><button className="iconbtn" onClick={onClose}><Icon name="x" size={16}/></button></div>
        <div className="drawer-body col" style={{ gap:"var(--sp-xs)" }}>
          {classes.map((c,i)=>(
            <div key={c.id} className="row gap-sm" style={{ padding:"var(--sp-sm)", borderRadius:"var(--r-md)", position:"relative" }}>
              <Icon name="grip" size={15} style={{ color:"var(--text-tertiary)", cursor:"grab" }} />
              <button className="cbx" style={{ background:c.color, boxShadow:"none", width:22, height:22 }} onClick={()=>setPicker(picker===c.id?null:c.id)} />
              <input className="field" style={{ flex:1, boxShadow:"none", background:"transparent" }} value={c.name} onChange={e=>rename(c.id, e.target.value)} />
              <span className="kbd">{i+1}</span>
              <button className="iconbtn sm" onClick={()=>del(c.id)}><Icon name="trash" size={14}/></button>
              {picker===c.id && (
                <div className="dropmenu" style={{ top:"100%", left:40, display:"grid", gridTemplateColumns:"repeat(8,1fr)", gap:6, padding:"var(--sp-md)" }}>
                  {palette.map(col=>(
                    <button key={col} onClick={()=>{recolor(c.id,col);setPicker(null);}} style={{ width:20, height:20, borderRadius:5, background:col, boxShadow: col===c.color?"0 0 0 2px var(--surface), 0 0 0 4px var(--primary)":"none" }} />
                  ))}
                </div>
              )}
            </div>
          ))}
          <button className="btn btn-secondary" style={{ marginTop:"var(--sp-md)" }} onClick={add}><Icon name="plus" size={15}/>{t("Add class")}</button>
        </div>
        <div className="modal-foot"><button className="btn btn-ghost" onClick={onClose}>{t("Close")}</button><button className="btn btn-primary" onClick={()=>{onClose();pushToast({icon:"check",msg:"Classes saved"});}}>{t("Save changes")}</button></div>
      </div>
    </div>
  );
}

/* ---------- Settings drawer ---------- */
function SettingsDrawer({ onClose, theme, setTheme, density, setDensity, fmt, setFmt, device, setDevice, lang, setLang }) {
  const Row = ({ label, hint, children }) => (
    <div className="row" style={{ justifyContent:"space-between", alignItems:"center", padding:"var(--sp-md) 0", borderBottom:"1px solid var(--border)" }}>
      <div className="col"><span className="t-body">{label}</span>{hint&&<span className="t-caption">{hint}</span>}</div>{children}</div>
  );
  return (
    <div className="scrim" onMouseDown={onClose} style={{ justifyContent:"flex-end" }}>
      <div className="drawer" onMouseDown={e=>e.stopPropagation()}>
        <div className="drawer-head"><span className="t-title">{t("Settings")}</span><button className="iconbtn" onClick={onClose}><Icon name="x" size={16}/></button></div>
        <div className="drawer-body">
          <span className="section-label">{t("Appearance")}</span>
          <Row label={t("Language")}><Segmented value={lang} onChange={setLang} options={[{value:"en",label:"EN"},{value:"fa",label:"فارسی"}]} /></Row>
          <Row label={t("Theme")}><Segmented value={theme} onChange={setTheme} options={[{value:"dark",label:t("Dark")},{value:"light",label:t("Light")}]} /></Row>
          <Row label={t("Density")} hint={t("Affects spacing & row heights")}><Segmented value={density} onChange={setDensity} options={[{value:"compact",label:t("Compact")},{value:"comfortable",label:t("Cozy")},{value:"spacious",label:t("Roomy")}]} /></Row>
          <div style={{ height:"var(--sp-lg)" }} />
          <span className="section-label">{t("Project")}</span>
          <Row label={t("Output format")} hint={t("Per-project annotation format")}>
            <select className="field" value={fmt} onChange={e=>setFmt(e.target.value)} style={{ appearance:"none" }}>{["YOLO","Pascal VOC","COCO","CSV"].map(f=><option key={f}>{f}</option>)}</select>
          </Row>
          <Row label={t("Output directory")}><label className="field" style={{ maxWidth:180 }}><input defaultValue="./labels" /></label></Row>
          <div style={{ height:"var(--sp-lg)" }} />
          <span className="section-label">{t("Inference")}</span>
          <Row label={t("Device")} hint={t("YOLO compute target")}><Segmented value={device} onChange={setDevice} options={[{value:"gpu",label:"GPU"},{value:"cpu",label:"CPU"}]} /></Row>
          <Row label={t("Auto-save debounce")} hint={t("Delay before writing")}><span className="mono t-body">800 ms</span></Row>
        </div>
      </div>
    </div>
  );
}

/* ---------- Context menu (right click on box) ---------- */
function BoxContextMenu({ x, y, box, classes, onClose, onDelete, onChangeClass }) {
  useEffectM(() => { const h = () => onClose(); window.addEventListener("click", h); return () => window.removeEventListener("click", h); }, []);
  const [sub, setSub] = useStateM(false);
  return (
    <div className="dropmenu" style={{ left:x, top:y, position:"fixed" }} onClick={e=>e.stopPropagation()}>
      <div className="menu-item" onMouseEnter={()=>setSub(true)} onMouseLeave={()=>setSub(false)} style={{ position:"relative" }}>
        <Icon name="tag" size={15} className="ic"/>Change class<Icon name="chevRight" size={14} style={{ marginLeft:"auto" }}/>
        {sub && (
          <div className="dropmenu" style={{ left:"100%", top:0, maxHeight:240, overflow:"auto" }}>
            {classes.map(c=>(
              <div key={c.id} className="menu-item" onClick={()=>{onChangeClass(box.id,c.id);onClose();}}>
                <span className="dot" style={{ width:9,height:9,borderRadius:2,background:c.color,display:"inline-block" }}/>{c.name}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="menu-sep" />
      <div className="menu-item danger" onClick={()=>{onDelete(box.id);onClose();}}><Icon name="trash" size={15} className="ic" style={{color:"var(--danger)"}}/>Delete box<span className="kbd" style={{marginLeft:"auto"}}>Del</span></div>
    </div>
  );
}

/* ---------- Toasts ---------- */
function ToastHost({ toasts, dismiss }) {
  return (
    <div className="toast-wrap">
      {toasts.map(t => (
        <div className="toast" key={t.id} style={{ position:"relative", overflow:"hidden" }}>
          <Icon name={t.icon||"info"} size={18} className="ticon" style={{ color:"var(--primary)" }} />
          <span className="tmsg">{t.msg}</span>
          {t.undo && <button className="btn btn-ghost sm" style={{ color:"var(--primary)" }} onClick={()=>{t.undo();dismiss(t.id);}}>Undo</button>}
          <button className="iconbtn sm" onClick={()=>dismiss(t.id)}><Icon name="x" size={13}/></button>
          <div className="tbar" />
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { CommandPalette, AutoLabelModal, SplitModal, ClassManagerDrawer, SettingsDrawer, BoxContextMenu, ToastHost, SystemDrawer });

/* ---------- System analysis drawer ---------- */
function SystemDrawer({ onClose, pushToast }) {
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const rnd = (a,b)=>a+Math.random()*(b-a);
  // static hardware facts (mock probe)
  const HW = {
    gpu:"NVIDIA GeForce RTX 4070", vramTotal:12, driver:"552.22",
    ramTotal:32, cpu:"AMD Ryzen 9 7900X", cores:12, threads:24,
    diskTotal:931, diskUsed:412,
  };
  const [live, setLive] = useStateM({ vram:3.4, ram:18.2, gpu:24, cpu:31 });
  const [scanning, setScanning] = useStateM(true);
  useEffectM(() => {
    const id = setInterval(() => setLive(s => ({
      vram: +clamp(s.vram + rnd(-0.4,0.4), 2.6, 9.4).toFixed(1),
      ram:  +clamp(s.ram + rnd(-0.6,0.6), 13, 27).toFixed(1),
      gpu:  Math.round(clamp(s.gpu + rnd(-8,8), 6, 92)),
      cpu:  Math.round(clamp(s.cpu + rnd(-7,7), 9, 74)),
    })), 1600);
    const t0 = setTimeout(()=>setScanning(false), 900);
    return () => { clearInterval(id); clearTimeout(t0); };
  }, []);
  const rescan = () => { setScanning(true); setTimeout(()=>{ setScanning(false); pushToast({icon:"cpu",msg:t("Scan complete")}); }, 900); };
  const col = (p) => p < 60 ? "var(--success)" : p < 85 ? "var(--warning)" : "var(--danger)";

  const Gauge = ({ icon, title, value, total, unit, pct, sub }) => {
    const p = pct != null ? pct : Math.round(value/total*100);
    return (
      <div className="gauge">
        <div className="gauge-top">
          <Icon name={icon} size={16} style={{ color:"var(--text-secondary)" }} />
          <span className="t-body-strong grow">{title}</span>
          <span className="mono tnum t-body">{pct!=null ? p+"%" : `${value} / ${total} ${unit}`}</span>
        </div>
        <div className="gauge-bar"><i style={{ width: (scanning?0:p)+"%", background: col(p) }} /></div>
        <span className="t-caption">{sub}</span>
      </div>
    );
  };

  return (
    <div className="scrim" onMouseDown={onClose} style={{ justifyContent:"flex-end" }}>
      <div className="drawer" onMouseDown={e=>e.stopPropagation()}>
        <div className="drawer-head">
          <div className="row gap-md">
            <span className="cbx" style={{ background:"var(--primary)", boxShadow:"none", color:"#fff", width:28, height:28 }}><Icon name="cpu" size={16}/></span>
            <div className="col"><span className="t-title">{t("System analysis")}</span>
              <span className="t-caption row gap-sm"><span className="live-dot" />{t("Live")}</span></div>
          </div>
          <button className="iconbtn" onClick={onClose}><Icon name="x" size={16}/></button>
        </div>
        <div className="drawer-body col" style={{ gap:"var(--sp-lg)" }}>
          <div className="sys-banner">
            <span className="ok"><Icon name="check" size={20}/></span>
            <div className="col"><span className="t-body-strong" style={{ color:"var(--success)" }}>{t("CUDA available")} · CUDA 12.4</span>
              <span className="t-caption">{t("Ready for GPU training")}</span></div>
          </div>

          <Gauge icon="gpu" title={t("Graphics (GPU)")} value={live.vram} total={HW.vramTotal} unit="GB" sub={`${HW.gpu} · ${t("VRAM usage")}`} />
          <Gauge icon="layers" title={t("Memory (RAM)")} value={live.ram} total={HW.ramTotal} unit="GB" sub={`${(HW.ramTotal-live.ram).toFixed(1)} GB ${t("free")} · DDR5`} />
          <Gauge icon="cpu" title={t("GPU utilization")} pct={live.gpu} sub={`${HW.gpu}`} />
          <Gauge icon="hash" title={t("CPU utilization")} pct={live.cpu} sub={`${HW.cpu} · ${HW.cores} ${t("cores")} / ${HW.threads} ${t("threads")}`} />
          <Gauge icon="save" title={t("Storage")} value={HW.diskUsed} total={HW.diskTotal} unit="GB" sub={`${HW.diskTotal-HW.diskUsed} GB ${t("free")}`} />

          <div className="card pad col" style={{ gap:0 }}>
            <span className="section-label" style={{ marginBottom:"var(--sp-sm)" }}>{t("Environment")}</span>
            {[["PyTorch","2.3.1+cu124"],["Ultralytics","8.2.103"],["Python","3.11.9"],["cuDNN","9.1.0"],[t("Driver"),HW.driver],["OpenCV","4.10.0"]].map(([k,v])=>(
              <div className="spec-row" key={k}><span className="k t-body">{k}</span><span className="mono t-body">{v}</span></div>
            ))}
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>{t("Close")}</button>
          <button className="btn btn-primary" onClick={rescan}><Icon name="refresh" size={15} style={{ animation: scanning?"spin .8s linear infinite":"none" }}/>{t("Re-scan")}</button>
        </div>
      </div>
    </div>
  );
}
