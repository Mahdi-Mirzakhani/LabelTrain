/* ============================================================
   tabs.jsx — Dataset, Train, Deploy routes (full body each)
   ============================================================ */
const { useState: useStateT, useMemo: useMemoT } = React;

/* ================= DATASET ================= */
function DatasetRoute({ images, classes, classColor, openImage, density }) {
  const [selRow, setSelRow] = useStateT(null);
  const [hoverBar, setHoverBar] = useStateT(null);
  const [classFilter, setClassFilter] = useStateT([]);
  const total = images.length;
  const labeled = images.filter(i=>i.labeled).length;
  const anns = images.reduce((a,i)=>a+i.boxes.length,0);
  const maxC = Math.max(...CLASS_DIST.map(d=>d.count));
  const kpis = [
    { num: total.toLocaleString(), lbl:t("Total images"), trend:"+48 this week" },
    { num: labeled.toLocaleString(), lbl:t("Labeled"), trend:`${Math.round(labeled/total*100)}% complete` },
    { num: anns.toLocaleString(), lbl:t("Annotations"), trend:"4.2 avg / image" },
    { num: classes.length, lbl:t("Classes"), trend:"8 in model" },
  ];

  return (
    <div className="body">
      <div className="sidebar">
        <div className="list-head"><span className="section-label">{t("Filter & query")}</span></div>
        <div className="scroll pad" style={{ display:"flex", flexDirection:"column", gap:"var(--sp-xl)" }}>
          <div className="col gap-md">
            <span className="t-label tsec">{t("By class")}</span>
            {classes.map(c => (
              <Checkbox key={c.id} on={classFilter.includes(c.id)} onChange={()=>setClassFilter(f=>f.includes(c.id)?f.filter(x=>x!==c.id):[...f,c.id])}
                label={<span className="row gap-sm"><span className="dot" style={{width:9,height:9,borderRadius:2,background:c.color,display:"inline-block"}}/>{c.name}</span>} />
            ))}
          </div>
          <div className="col gap-md">
            <span className="t-label tsec">{t("Status")}</span>
            {["Has annotations","Unlabeled","Reviewed","Flagged"].map(s=>(
              <Checkbox key={s} on={false} onChange={()=>{}} label={t(s)} />
            ))}
          </div>
          <div className="col gap-md">
            <span className="t-label tsec">{t("Saved presets")}</span>
            {["Sparse classes","Tiny boxes","Recently added"].map(s=>(
              <div key={s} className="row gap-sm" style={{ color:"var(--text-secondary)", cursor:"pointer" }}><Icon name="filter" size={13}/><span className="t-body">{t(s)}</span></div>
            ))}
          </div>
        </div>
      </div>

      <div className="workspace">
        <div className="wsbar"><span className="t-title">{t("Dataset overview")}</span>
          <button className="btn btn-secondary sm"><Icon name="download" size={14}/>{t("Export all")}</button></div>
        <div className="scroll pad col" style={{ gap:"var(--sp-xl)" }}>
          <div className="kpi-grid">
            {kpis.map(k=>(
              <div className="kpi" key={k.lbl}>
                <div className="num tnum">{k.num}</div>
                <div className="lbl">{k.lbl}</div>
                <div className="t-caption" style={{ marginTop:8, color:"var(--success)" }}>{k.trend}</div>
              </div>
            ))}
          </div>

          <div className="card pad">
            <div className="row" style={{ justifyContent:"space-between", marginBottom:"var(--sp-md)" }}>
              <span className="t-subtitle">{t("Class distribution")}</span>
              <span className="t-caption">{anns.toLocaleString()} {t("instances")}</span>
            </div>
            <div className="bars">
              {CLASS_DIST.map(d=>(
                <div className="bar-col" key={d.cls} onMouseEnter={()=>setHoverBar(d.cls)} onMouseLeave={()=>setHoverBar(null)}>
                  {hoverBar===d.cls && <span className="t-caption tnum" style={{color:"var(--text)"}}>{d.count} · {Math.round(d.count/anns*100)}%</span>}
                  <div className="bar" style={{ height:`${d.count/maxC*100}%`, background:classColor(d.cls) }} />
                  <span className="t-caption" style={{ whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:"100%" }}>{d.cls}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ overflow:"hidden" }}>
            <table className="tbl">
              <thead><tr>
                <th style={{width:52}}></th><th>Filename</th><th style={{width:70}}>Boxes</th>
                <th>Classes</th><th style={{width:90}}>Status</th><th style={{width:110}}>Modified</th>
              </tr></thead>
              <tbody>
                {images.slice(0,18).map((im,i)=>{
                  const cls=[...new Set(im.boxes.map(b=>b.cls))];
                  return (
                    <tr key={im.id} onClick={()=>setSelRow(i)} style={{ background:selRow===i?"var(--selection)":undefined }} onDoubleClick={()=>openImage(i)}>
                      <td><Img src={im.thumb} label={im.name} style={{width:36,height:28,borderRadius:4,objectFit:"cover"}}/></td>
                      <td className="mono">{im.name}</td>
                      <td className="tnum">{im.boxes.length}</td>
                      <td><div className="row gap-sm" style={{flexWrap:"wrap"}}>{cls.slice(0,4).map(c=><span key={c} className="dot" style={{width:9,height:9,borderRadius:2,background:classColor(c),display:"inline-block"}}/>)}{cls.length>4 && <span className="t-caption">+{cls.length-4}</span>}</div></td>
                      <td>{im.labeled?<Pill kind="success" dot>labeled</Pill>:<Pill kind="muted">empty</Pill>}</td>
                      <td className="t-caption">{im.modified} ago</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="inspector">
        <div className="panel-head"><span className="t-body-strong">{selRow==null?t("Dataset health"):t("Image preview")}</span></div>
        <div className="scroll pad col" style={{ gap:"var(--sp-md)" }}>
          {selRow==null ? HEALTH.map((h,i)=>(
            <div key={i} className="row gap-md" style={{ alignItems:"flex-start", padding:"var(--sp-md)", borderRadius:"var(--r-md)", background:"var(--surface-2)", boxShadow:"inset 0 0 0 1px var(--border)" }}>
              <Icon name={h.sev==="danger"?"alert":h.sev==="warning"?"alert":"info"} size={16} style={{ color:`var(--${h.sev==="info"?"info":h.sev})`, marginTop:1, flex:"none" }} />
              <span className="t-body">{h.text}</span>
            </div>
          )) : (
            <div className="col gap-md">
              <Img src={images[selRow].url} label={images[selRow].name} style={{ width:"100%", borderRadius:"var(--r-lg)", aspectRatio:"3/2", objectFit:"cover" }} />
              <div className="mono t-body">{images[selRow].name}</div>
              <div className="t-caption">{images[selRow].boxes.length} boxes · {images[selRow].modified} ago</div>
              <button className="btn btn-primary" onClick={()=>openImage(selRow)}><Icon name="edit" size={14}/>{t("Open in Annotate")}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================= TRAIN ================= */
function TrainRoute({ classes, pushToast }) {
  const [profile, setProfile] = useStateT("small");
  const [ratios, setRatios] = useStateT({ train:.7, val:.2, test:.1 });
  const [seed, setSeed] = useStateT(42);
  const [imgsz, setImgsz] = useStateT(640);
  const [epochs, setEpochs] = useStateT(100);
  const [batch, setBatch] = useStateT(16);
  const [copyImgs, setCopyImgs] = useStateT(true);
  const [focus, setFocus] = useStateT(null);
  const model = TRAIN_PROFILES.find(p=>p.id===profile).model;

  const setRatio = (key, v) => {
    const others = ["train","val","test"].filter(k=>k!==key);
    const rest = 1 - v; const sum = ratios[others[0]]+ratios[others[1]] || 1;
    setRatios({ [key]:v, [others[0]]: +(rest*(ratios[others[0]]/sum)).toFixed(2), [others[1]]: +(rest*(ratios[others[1]]/sum)).toFixed(2) });
  };
  const sumOk = Math.abs(ratios.train+ratios.val+ratios.test-1)<0.02;
  const yaml = `path: ./dataset
train: images/train
val: images/val
test: images/test

nc: ${classes.length}
names:
${classes.map((c,i)=>`  ${i}: ${c.name}`).join("\n")}`;
  const cli = `yolo train data=dataset.yaml model=${model}.pt \\\n  epochs=${epochs} imgsz=${imgsz} batch=${batch} seed=${seed}`;

  const help = {
    val: { t:"Validation ratio", d:"Held-out images used to measure generalization during training. 15–20% is typical; too small and the metric gets noisy." },
    imgsz: { t:"Image size", d:"Inference/training resolution. 640 is the sweet spot for speed; 1280 helps small objects but is ~4× slower." },
    epochs: { t:"Epochs", d:"Full passes over the training set. Start at 100 for a fresh model; watch for the loss plateauing." },
    seed: { t:"Random seed", d:"Fixes the train/val/test shuffle so a split is reproducible across runs." },
  };
  const hk = focus && help[focus] ? help[focus] : { t:"Training config", d:"Build a reproducible training bundle. Focus a field for contextual guidance." };

  return (
    <div className="body">
      <div className="sidebar">
        <div className="list-head"><span className="section-label">{t("Training profiles")}</span></div>
        <div className="scroll pad col gap-md">
          {TRAIN_PROFILES.map(p=>(
            <div key={p.id} className={"pm-card"+(profile===p.id?"":"")} style={{ padding:"var(--sp-md) var(--sp-lg)", boxShadow:profile===p.id?"inset 0 0 0 1.5px var(--primary)":"inset 0 0 0 1px var(--border)" }} onClick={()=>{setProfile(p.id);setEpochs(p.epochs);setImgsz(p.imgsz);}}>
              <div className="row" style={{ justifyContent:"space-between" }}><span className="t-body-strong">{p.name}</span>{profile===p.id&&<Icon name="check" size={15} style={{color:"var(--primary)"}}/>}</div>
              <div className="t-caption mono" style={{ marginTop:4 }}>{p.model} · {p.epochs}ep · {p.imgsz}px</div>
            </div>
          ))}
        </div>
      </div>

      <div className="workspace">
        <div className="wsbar"><span className="t-title">{t("Export training bundle")}</span>
          {!sumOk && <Pill kind="warning" dot>{t("ratios must sum to 1.0")}</Pill>}</div>
        <div className="scroll pad" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"var(--sp-xl)", alignItems:"start" }}>
          {/* left form */}
          <div className="col" style={{ gap:"var(--sp-xl)" }}>
            <div className="card pad col gap-sm">
              <span className="t-caption">{t("Source dataset")}</span>
              <span className="t-subtitle">Urban Traffic v3 · 480 images</span>
              <span className="t-caption">294 labeled · 8 classes · YOLO format</span>
            </div>

            <div className="col gap-md">
              <span className="t-label tsec">{t("Train / Val / Test split")}</span>
              {["train","val","test"].map(k=>(
                <div className="row gap-md" key={k}>
                  <span className="t-body" style={{ width:44, textTransform:"capitalize" }}>{t(k.charAt(0).toUpperCase()+k.slice(1))}</span>
                  <Slider value={ratios[k]} min={0} max={1} step={0.05} onChange={v=>setRatio(k,v)} />
                  <span className="mono t-body tnum" style={{ width:38, textAlign:"right" }}>{Math.round(ratios[k]*100)}%</span>
                </div>
              ))}
            </div>

            <div className="coord-grid">
              <div className="coord-cell" onFocus={()=>setFocus("seed")}><label>{t("Random seed")}</label><label className="field"><input type="number" value={seed} onChange={e=>setSeed(+e.target.value)} /></label></div>
              <div className="coord-cell" onFocus={()=>setFocus("imgsz")}><label>{t("Image size")}</label>
                <label className="field" style={{ paddingRight:4 }}><input type="number" value={imgsz} onChange={e=>setImgsz(+e.target.value)} /></label></div>
              <div className="coord-cell" onFocus={()=>setFocus("epochs")}><label>{t("Epochs")}</label><label className="field"><input type="number" value={epochs} onChange={e=>setEpochs(+e.target.value)} /></label></div>
              <div className="coord-cell"><label>{t("Batch size")}</label><label className="field"><input type="number" value={batch} onChange={e=>setBatch(+e.target.value)} /></label></div>
            </div>

            <div className="col gap-md">
              {[["Copy images to output folders",copyImgs,setCopyImgs],["Generate dataset.yaml",true,null],["Generate train.py starter",true,null]].map(([lab,val,set],i)=>(
                <div className="row" key={i} style={{ justifyContent:"space-between" }}>
                  <span className="t-body">{t(lab)}</span>
                  <Switch on={val} onChange={set||(()=>{})} />
                </div>
              ))}
            </div>
          </div>

          {/* right previews */}
          <div className="col" style={{ gap:"var(--sp-lg)" }}>
            <div className="col gap-sm">
              <span className="t-label tsec">dataset.yaml</span>
              <CodeBlock onCopy={()=>pushToast({icon:"copy",msg:"dataset.yaml copied"})}>
                {yaml.split("\n").map((l,i)=><div key={i}>{l}</div>)}
              </CodeBlock>
            </div>
            <div className="col gap-sm">
              <span className="t-label tsec">{t("CLI command")}</span>
              <CodeBlock onCopy={()=>pushToast({icon:"copy",msg:"Command copied"})}>
                <span className="tok-cmd">{cli}</span>
              </CodeBlock>
            </div>
            <button className="btn btn-primary lg" style={{ alignSelf:"flex-end" }} onClick={()=>pushToast({icon:"download",msg:"Training bundle exported"})} disabled={!sumOk}>
              <Icon name="download" size={16}/>{t("Export training bundle")}</button>
          </div>
        </div>
      </div>

      <div className="inspector">
        <div className="panel-head"><span className="t-body-strong">{t("Help")}</span></div>
        <div className="pad col gap-md">
          <span className="t-subtitle">{hk.t}</span>
          <span className="t-body tsec">{hk.d}</span>
          <div className="card pad col gap-sm" style={{ marginTop:"var(--sp-md)" }}>
            <span className="t-caption">{t("Resulting split")}</span>
            <div className="row gap-sm" style={{ height:10, borderRadius:5, overflow:"hidden" }}>
              <div style={{ flex:ratios.train, background:"var(--primary)" }} />
              <div style={{ flex:ratios.val, background:"var(--info)" }} />
              <div style={{ flex:ratios.test, background:"var(--warning)" }} />
            </div>
            <div className="t-caption tnum">~{Math.round(294*ratios.train)} train · {Math.round(294*ratios.val)} val · {Math.round(294*ratios.test)} test</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= DEPLOY ================= */
function DeployRoute({ pushToast }) {
  const [step, setStep] = useStateT(0);
  const [contents, setContents] = useStateT({ yaml:true, scripts:true, models:false, infer:true, readme:true });
  const [fmt, setFmt] = useStateT("zip");
  const steps = [t("Pick contents"),t("Choose format"),t("Output path"),t("Review")];
  const exports = [
    { name:"urban-traffic-v3-bundle.zip", time:"2 hours ago", size:"142 MB", fmt:"zip" },
    { name:"highway-drone-coco.tar.gz", time:"yesterday", size:"410 MB", fmt:"tar.gz" },
    { name:"pedestrian-export", time:"3 days ago", size:"88 MB", fmt:"folder" },
  ];
  const items = [
    ["yaml","dataset.yaml","Class names + split paths"],
    ["scripts","train.py starter","Ready-to-run Ultralytics script"],
    ["models","models/ folder","Include any .pt weights (+142 MB)"],
    ["infer","Sample inference script","predict.py with a demo image loop"],
    ["readme","README.md","Setup + usage instructions"],
  ];

  return (
    <div className="body">
      <div className="sidebar">
        <div className="list-head"><span className="section-label">{t("Past exports")}</span></div>
        <div className="scroll">
          {exports.map((e,i)=>(
            <div className="file-row" key={i}>
              <div className="thumb" style={{ display:"flex", alignItems:"center", justifyContent:"center", width:40, height:40 }}><Icon name="file" size={18} style={{color:"var(--text-tertiary)"}}/></div>
              <div className="file-meta"><div className="file-name mono">{e.name}</div><div className="file-sub">{e.size} · {e.time}</div></div>
            </div>
          ))}
        </div>
      </div>

      <div className="workspace">
        <div className="wsbar"><span className="t-title">{t("Deploy & bundle")}</span></div>
        <div className="scroll pad" style={{ maxWidth:680 }}>
          <div className="steps" style={{ marginBottom:"var(--sp-xl)" }}>
            {steps.map((s,i)=>(
              <div key={s} className={"step"+(i<step?" done":i===step?" on":"")}>
                <span className="dot">{i<step?<Icon name="check" size={14}/>:i+1}</span>
                <div className="col" style={{ paddingTop:4 }}>
                  <span className="t-body-strong">{s}</span>
                  {i===step && (
                    <div className="col gap-md" style={{ marginTop:"var(--sp-md)", marginBottom:"var(--sp-sm)" }}>
                      {i===0 && <div className="col gap-sm">{items.map(([k,t,d])=>(
                        <label key={k} className="row gap-md" style={{ padding:"var(--sp-sm)", borderRadius:"var(--r-md)", background:"var(--surface-2)", boxShadow:"inset 0 0 0 1px var(--border)", cursor:"pointer" }} onClick={(e)=>{e.preventDefault();setContents(c=>({...c,[k]:!c[k]}));}}>
                          <span className={"cbx"+(contents[k]?" on":"")}>{contents[k]&&<Icon name="check" size={12}/>}</span>
                          <div className="col"><span className="t-body-strong">{t}</span><span className="t-caption">{d}</span></div>
                        </label>
                      ))}</div>}
                      {i===1 && <div className="row gap-sm">{["zip","tar.gz","folder"].map(f=>(
                        <button key={f} className={"chip"+(fmt===f?" active":"")} onClick={()=>setFmt(f)}>{f}</button>
                      ))}</div>}
                      {i===2 && <label className="field" style={{ maxWidth:380 }}><Icon name="folder" size={15} className="ic"/><input defaultValue="~/exports/urban-traffic-v3" /></label>}
                      {i===3 && <div className="card pad col gap-sm">
                        <div className="row" style={{justifyContent:"space-between"}}><span className="t-caption">{t("Contents")}</span><span className="t-body">{Object.values(contents).filter(Boolean).length} {t("items")}</span></div>
                        <div className="row" style={{justifyContent:"space-between"}}><span className="t-caption">{t("Format")}</span><span className="t-body mono">{fmt}</span></div>
                        <div className="row" style={{justifyContent:"space-between"}}><span className="t-caption">{t("Est. size")}</span><span className="t-body tnum">{contents.models?"148 MB":"6 MB"}</span></div>
                      </div>}
                      <div className="row gap-sm">
                        {step>0 && <button className="btn btn-ghost sm" onClick={()=>setStep(step-1)}>{t("Back")}</button>}
                        {step<3 ? <button className="btn btn-primary sm" onClick={()=>setStep(step+1)}>{t("Continue")}<Icon name="arrowRight" size={14}/></button>
                          : <button className="btn btn-primary sm" onClick={()=>{pushToast({icon:"checkCircle",msg:"Bundle generated"});setStep(0);}}><Icon name="rocket" size={14}/>{t("Generate bundle")}</button>}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="inspector">
        <div className="panel-head"><span className="t-body-strong">{t("How to use this bundle")}</span></div>
        <div className="scroll pad col gap-lg">
          {[["Ultralytics CLI","yolo train data=dataset.yaml \\\n  model=yolov8s.pt epochs=100"],
            ["Local Python","from ultralytics import YOLO\nYOLO('yolov8s.pt').train(\n  data='dataset.yaml')"],
            ["Colab","!pip install ultralytics\n!yolo train data=dataset.yaml"]].map(([t,code])=>(
            <div className="col gap-sm" key={t}>
              <span className="t-label tsec">{t}</span>
              <CodeBlock onCopy={()=>pushToast({icon:"copy",msg:"Copied"})}>
                {code.split("\n").map((l,i)=><div key={i} className="tok-cmd">{l}</div>)}
              </CodeBlock>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { DatasetRoute, TrainRoute, DeployRoute });
