/* ============================================================
   app.jsx — App shell: title bar, tabs, status bar, routing,
   keyboard shortcuts, global state
   ============================================================ */
const { useState: useS, useEffect: useE, useCallback: useC, useRef: useR, useMemo: useMm } = React;

function App() {
  // routing: onboarding -> projects -> app
  const [screen, setScreen] = useS("onboarding"); // onboarding | projects | app
  const [tab, setTab] = useS("annotate"); // annotate | dataset | train | deploy

  // theme / density / language
  const [theme, setTheme] = useS("dark");
  const [density, setDensity] = useS("comfortable");
  const [fmt, setFmt] = useS("YOLO");
  const [device, setDevice] = useS("gpu");
  const [lang, setLang] = useS("en");
  applyLang(lang); // sync before children render so t() resolves
  useE(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useE(() => { document.documentElement.dataset.density = density; }, [density]);
  useE(() => { document.documentElement.dataset.lang = lang; document.documentElement.dir = lang === "fa" ? "rtl" : "ltr"; }, [lang]);

  // project / images / annotations
  const [project, setProject] = useS(PROJECTS[0]);
  const [images, setImages] = useS(() => IMAGES.map(im => ({ ...im, boxes: im.boxes.map(b => ({ ...b })) })));
  const [curIdx, setCurIdx] = useS(0);
  const [classes, setClasses] = useS(CLASSES);
  const [loading, setLoading] = useS(false);

  const cur = images[curIdx];
  const setBoxes = useC((updater) => {
    setImages(ims => ims.map((im,i) => i===curIdx ? { ...im, boxes: typeof updater==="function"?updater(im.boxes):updater, labeled:true } : im));
  }, [curIdx]);
  const boxes = cur ? cur.boxes : [];

  // annotate UI state
  const [tool, setTool] = useS("pointer");
  const [zoom, setZoom] = useS(1);
  const [selId, setSelId] = useS(null);
  const [activeClass, setActiveClass] = useS("car");
  const [search, setSearch] = useS("");
  const [filter, setFilter] = useS("all");
  const [showInspector, setShowInspector] = useS(true);
  const classColor = useC((id) => (classes.find(c=>c.id===id)||{}).color || "#888", [classes]);

  // overlays
  const [cmdk, setCmdk] = useS(false);
  const [autoLabel, setAutoLabel] = useS(false);
  const [split, setSplit] = useS(false);
  const [classMgr, setClassMgr] = useS(false);
  const [settings, setSettings] = useS(false);
  const [sysPanel, setSysPanel] = useS(false);
  const [ctxMenu, setCtxMenu] = useS(null);
  const [projMenu, setProjMenu] = useS(false);

  // toasts
  const [toasts, setToasts] = useS([]);
  const pushToast = useC((t) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(ts => [...ts, { ...t, id }]);
    setTimeout(() => setToasts(ts => ts.filter(x => x.id !== id)), 5000);
  }, []);
  const dismiss = useC((id) => setToasts(ts => ts.filter(t => t.id !== id)), []);

  // navigation between images
  const go = useC((d) => {
    setCurIdx(i => { const n = Math.max(0, Math.min(images.length-1, i+d)); return n; });
    setSelId(null);
  }, [images.length]);

  const openImageInAnnotate = useC((i) => { setCurIdx(i); setTab("annotate"); }, []);

  const switchProject = useC((p) => {
    setProject(p); setProjMenu(false); setScreen("app"); setLoading(true);
    setTimeout(() => setLoading(false), 650);
    pushToast({ icon:"folder", msg:`Opened ${p.name}` });
  }, [pushToast]);

  const deleteSel = useC(() => {
    if (!selId) return;
    setBoxes(bs => bs.filter(b => b.id !== selId));
    pushToast({ icon:"trash", msg:"Box deleted" });
    setSelId(null);
  }, [selId, setBoxes, pushToast]);

  // ----- commands for palette -----
  const commands = useMm(() => [
    { id:"tool-pointer", group:"Tools", icon:"pointer", label:"Pointer tool", keys:["V"], run:()=>setTool("pointer") },
    { id:"tool-box", group:"Tools", icon:"box", label:"Box tool", keys:["B"], run:()=>setTool("box") },
    { id:"next", group:"Navigate", icon:"arrowRight", label:"Next image", keys:["N"], run:()=>go(1) },
    { id:"prev", group:"Navigate", icon:"arrowLeft", label:"Previous image", keys:["P"], run:()=>go(-1) },
    { id:"go-annotate", group:"Navigate", icon:"edit", label:"Go to Annotate", run:()=>setTab("annotate") },
    { id:"go-dataset", group:"Navigate", icon:"layers", label:"Go to Dataset", run:()=>setTab("dataset") },
    { id:"go-train", group:"Navigate", icon:"cpu", label:"Go to Train", run:()=>setTab("train") },
    { id:"go-deploy", group:"Navigate", icon:"rocket", label:"Go to Deploy", run:()=>setTab("deploy") },
    { id:"auto", group:"Actions", icon:"sparkles", label:"Auto-label with YOLO", kw:"ai detect", run:()=>setAutoLabel(true) },
    { id:"split", group:"Actions", icon:"split", label:"Split train / val / test", run:()=>setSplit(true) },
    { id:"classes", group:"Actions", icon:"tag", label:"Manage classes", run:()=>setClassMgr(true) },
    { id:"sys", group:"Actions", icon:"cpu", label:"Open system analysis", kw:"cuda gpu ram سیستم", run:()=>setSysPanel(true) },
    { id:"export", group:"Actions", icon:"download", label:"Export dataset", run:()=>{setTab("deploy");pushToast({icon:"download",msg:"Jump to Deploy to export"});} },
    { id:"save", group:"Actions", icon:"save", label:"Save current image", keys:["⌘","S"], run:()=>pushToast({icon:"save",msg:t("Auto-saved")}) },
    { id:"theme", group:"Settings", icon: theme==="dark"?"sun":"moon", label:`Switch to ${theme==="dark"?"light":"dark"} theme`, run:()=>setTheme(t=>t==="dark"?"light":"dark") },
    { id:"lang", group:"Settings", icon:"info", label:"Switch language", kw:"persian farsi فارسی zaban زبان", run:()=>setLang(l=>l==="en"?"fa":"en") },
    { id:"density", group:"Settings", icon:"layers", label:"Cycle density", run:()=>setDensity(d=>({comfortable:"compact",compact:"spacious",spacious:"comfortable"}[d])) },
    { id:"settings", group:"Settings", icon:"settings", label:"Open settings", run:()=>setSettings(true) },
    { id:"projects", group:"Settings", icon:"folder", label:"Switch project…", run:()=>setScreen("projects") },
    ...images.slice(0,8).map((im,i)=>({ id:"img"+i, group:"Files", icon:"image", label:im.name, run:()=>openImageInAnnotate(i) })),
  ].map(c => ({ ...c, label: c.group==="Files" ? c.label : t(c.label), group: t(c.group) })), [theme, lang, images, go, pushToast, openImageInAnnotate]);

  const runCmd = useC((c) => c.run && c.run(), []);

  // ----- keyboard shortcuts -----
  useE(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName||"").toLowerCase();
      const typing = tag==="input" || tag==="textarea" || tag==="select";
      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="k") { e.preventDefault(); setCmdk(v=>!v); return; }
      if (typing) return;
      if (screen !== "app") return;
      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="s") { e.preventDefault(); pushToast({icon:"save",msg:"Image saved"}); return; }
      if (e.metaKey||e.ctrlKey) {
        if (e.key==="=" || e.key==="+") { e.preventDefault(); setZoom(z=>Math.min(3,+(z*1.2).toFixed(2))); return; }
        if (e.key==="-") { e.preventDefault(); setZoom(z=>Math.max(0.4,+(z*0.83).toFixed(2))); return; }
        if (e.key==="0") { e.preventDefault(); setZoom(1); return; }
        return;
      }
      const k = e.key.toLowerCase();
      if (k==="v") setTool("pointer");
      else if (k==="b") setTool("box");
      else if (k==="n") go(1);
      else if (k==="p") go(-1);
      else if (e.key==="Delete" || e.key==="Backspace") deleteSel();
      else if (e.key==="Escape") setSelId(null);
      else if (tab==="annotate" && /^[1-9]$/.test(e.key)) { const c = classes[+e.key-1]; if (c) setActiveClass(c.id); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, tab, classes, go, deleteSel, pushToast]);

  // ----- render routes -----
  if (screen === "onboarding") return <><Onboarding onDone={()=>setScreen("projects")} /><ToastHost toasts={toasts} dismiss={dismiss} /></>;
  if (screen === "projects") return <><ProjectManager onOpen={switchProject} onNew={()=>switchProject(PROJECTS[0])} /><ToastHost toasts={toasts} dismiss={dismiss} /></>;

  const TABS = [
    { id:"annotate", label:t("Annotate"), icon:"edit" },
    { id:"dataset", label:t("Dataset"), icon:"layers" },
    { id:"train", label:t("Train"), icon:"cpu" },
    { id:"deploy", label:t("Deploy"), icon:"rocket" },
  ];
  const labeledCount = images.filter(i=>i.labeled).length;
  const pct = Math.round(labeledCount/images.length*100);

  return (
    <div className="app">
      {/* ---------- Title bar ---------- */}
      <div className="titlebar">
        <div className="tb-traffic nodrag"><span style={{background:"#FF5F57"}}/><span style={{background:"#FEBC2E"}}/><span style={{background:"#28C840"}}/></div>
        <div className="tb-logo" style={{ marginLeft:6 }}><span className="mark"><Icon name="scan" size={14}/></span></div>
        <div className="nodrag" style={{ position:"relative" }}>
          <button className="proj-switch" onClick={()=>setProjMenu(v=>!v)}>
            <span className="t-body-strong">{project.name}</span><Icon name="chevDown" size={14} />
          </button>
          {projMenu && (
            <div className="dropmenu" style={{ top:"100%", left:0, minWidth:240 }}>
              <div className="cmdk-group">Switch project</div>
              {PROJECTS.map(p=>(
                <div key={p.id} className="menu-item" onClick={()=>switchProject(p)}>
                  <Icon name={p.id===project.id?"check":"folder"} size={15} className="ic" style={{ opacity:p.id===project.id?1:.6 }} />
                  <span className="grow">{p.name}</span><span className="t-caption">{p.count}</span>
                </div>
              ))}
              <div className="menu-sep" />
              <div className="menu-item" onClick={()=>{setScreen("projects");setProjMenu(false);}}><Icon name="layers" size={15} className="ic"/>{t("All projects…")}</div>
            </div>
          )}
        </div>

        <div className="grow" style={{ display:"flex", justifyContent:"center" }}>
          <div className="tabs-top nodrag">
            {TABS.map(t=>(
              <button key={t.id} className={"tab-top"+(tab===t.id?" active":"")} onClick={()=>setTab(t.id)}>
                <Icon name={t.icon} size={14} />{t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="row gap-sm nodrag">
          <button className="cmdk-btn" onClick={()=>setCmdk(true)}>
            <Icon name="search" size={14} /><span>{t("Search")}</span><span className="kbd-group"><span className="kbd">⌘</span><span className="kbd">K</span></span>
          </button>
          <Tip label={t("System analysis")}><button className="iconbtn" onClick={()=>setSysPanel(true)}><Icon name="cpu" size={17}/></button></Tip>
          <Tip label={t("Auto-label")}><button className="iconbtn" onClick={()=>setAutoLabel(true)}><Icon name="sparkles" size={17}/></button></Tip>
          <Tip label={theme==="dark"?t("Light theme"):t("Dark theme")}><button className="iconbtn" onClick={()=>setTheme(t=>t==="dark"?"light":"dark")}><Icon name={theme==="dark"?"sun":"moon"} size={17}/></button></Tip>
          <Tip label={t("Settings")}><button className="iconbtn" onClick={()=>setSettings(true)}><Icon name="settings" size={17}/></button></Tip>
        </div>
      </div>

      {/* ---------- Body per tab ---------- */}
      {tab==="annotate" && (
        <div className="body">
          <FileList images={images} curIdx={curIdx} setCurIdx={(i)=>{setCurIdx(i);setSelId(null);}} search={search} setSearch={setSearch} filter={filter} setFilter={setFilter} loading={loading} />
          <div className="workspace">
            <div className="wsbar">
              <div className="row gap-md">
                <button className="iconbtn" onClick={()=>go(-1)} disabled={curIdx===0}><Icon name="chevLeft" size={18}/></button>
                <div className="col" style={{ alignItems:"center" }}>
                  <span className="t-body-strong mono">{cur?cur.name:"—"}</span>
                  <span className="t-caption tnum">{curIdx+1} {t("of")} {images.length}</span>
                </div>
                <button className="iconbtn" onClick={()=>go(1)} disabled={curIdx===images.length-1}><Icon name="chevRight" size={18}/></button>
              </div>
              <div className="row gap-sm">
                <button className="btn btn-secondary sm" onClick={()=>setAutoLabel(true)}><Icon name="sparkles" size={14}/>{t("Auto-label")}</button>
                <button className="btn btn-secondary sm" onClick={()=>setClassMgr(true)}><Icon name="tag" size={14}/>{t("Classes")}</button>
                <button className="btn btn-primary sm" onClick={()=>pushToast({icon:"save",msg:t("Auto-saved")})}><Icon name="save" size={14}/>{t("Save")}</button>
              </div>
            </div>
            <div style={{ position:"relative", flex:1, display:"flex", minHeight:0 }}>
              <CanvasStage image={cur} boxes={boxes} setBoxes={setBoxes} selId={selId} setSelId={setSelId}
                tool={tool} activeClass={activeClass} zoom={zoom} setZoom={setZoom} classColor={classColor}
                onContext={(e,b)=>setCtxMenu({ x:e.clientX, y:e.clientY, box:b })} pushToast={pushToast} />
              <ToolRail tool={tool} setTool={setTool} zoom={zoom} setZoom={setZoom} toggleInspector={()=>setShowInspector(v=>!v)} />
              <ChipBar classes={classes} boxes={boxes} activeClass={activeClass} setActiveClass={setActiveClass} onAddClass={()=>setClassMgr(true)} />
              <div className="overlay zoom-pill">
                <button className="iconbtn sm" onClick={()=>setZoom(z=>Math.max(0.4,+(z*0.83).toFixed(2)))}><Icon name="minus" size={14}/></button>
                {Math.round(zoom*100)}%
                <button className="iconbtn sm" onClick={()=>setZoom(z=>Math.min(3,+(z*1.2).toFixed(2)))}><Icon name="plus" size={14}/></button>
              </div>
            </div>
          </div>
          {showInspector && <AnnotateInspector boxes={boxes} setBoxes={setBoxes} selId={selId} setSelId={setSelId} classes={classes} classColor={classColor} />}
        </div>
      )}
      {tab==="dataset" && <DatasetRoute images={images} classes={classes} classColor={classColor} openImage={openImageInAnnotate} density={density} />}
      {tab==="train" && <TrainRoute classes={classes} pushToast={pushToast} />}
      {tab==="deploy" && <DeployRoute pushToast={pushToast} />}

      {/* ---------- Status bar ---------- */}
      <div className="statusbar">
        <button className="status-item" onClick={()=>setSysPanel(true)} style={{ background:"none" }}><Icon name={device==="gpu"?"gpu":"cpu"} size={13} style={{color:"var(--success)"}}/>YOLO {device==="gpu"?t("CUDA ready"):t("CPU ready")}</button>
        <span className="sep" />
        <span className="status-item"><Icon name="tag" size={13}/>{classes.length} {t("classes")}</span>
        <span className="sep" />
        <span className="status-item mono">{fmt}</span>
        <span className="grow" />
        <span className="status-item"><Icon name="checkCircle" size={13} style={{color:"var(--success)"}}/>{t("Auto-saved")}</span>
        <span className="sep" />
        <span className="status-item tnum">{labeledCount}/{images.length} {t("labeled")}</span>
        <div style={{ width:90 }}><div className="prog"><i style={{ width:pct+"%" }} /></div></div>
        <span className="status-item tnum">{pct}%</span>
      </div>

      {/* ---------- Overlays ---------- */}
      {cmdk && <CommandPalette commands={commands} onClose={()=>setCmdk(false)} onRun={runCmd} />}
      {autoLabel && <AutoLabelModal onClose={()=>setAutoLabel(false)} classes={classes} pushToast={pushToast} />}
      {split && <SplitModal onClose={()=>setSplit(false)} pushToast={pushToast} />}
      {classMgr && <ClassManagerDrawer onClose={()=>setClassMgr(false)} classes={classes} setClasses={setClasses} pushToast={pushToast} />}
      {settings && <SettingsDrawer onClose={()=>setSettings(false)} theme={theme} setTheme={setTheme} density={density} setDensity={setDensity} fmt={fmt} setFmt={setFmt} device={device} setDevice={setDevice} lang={lang} setLang={setLang} />}
      {sysPanel && <SystemDrawer onClose={()=>setSysPanel(false)} pushToast={pushToast} />}
      {ctxMenu && <BoxContextMenu {...ctxMenu} classes={classes} onClose={()=>setCtxMenu(null)} onDelete={(id)=>{setBoxes(bs=>bs.filter(b=>b.id!==id));if(id===selId)setSelId(null);}} onChangeClass={(id,cls)=>setBoxes(bs=>bs.map(b=>b.id===id?{...b,cls}:b))} />}
      <ToastHost toasts={toasts} dismiss={dismiss} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
