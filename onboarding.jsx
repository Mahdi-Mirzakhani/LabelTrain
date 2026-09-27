/* ============================================================
   onboarding.jsx — Onboarding flow + Project Manager
   ============================================================ */
const { useState: useStateO } = React;

function Onboarding({ onDone }) {
  const [step, setStep] = useStateO(0);
  const slides = [
    { icon:"images", title:t("Label images fast"), body:t("A keyboard-first desktop tool for drawing bounding boxes and exporting clean YOLO datasets — built for speed.") },
    { icon:"sparkles", title:t("Let YOLO do the first pass"), body:t("Auto-label hundreds of images with a pretrained model, then just review and correct. Minutes, not hours.") },
    { icon:"rocket", title:t("Train-ready in one click"), body:t("Split, configure, and export a reproducible bundle with dataset.yaml and a starter script. Drop it straight into Ultralytics.") },
  ];
  const last = step === slides.length;
  if (last) {
    return (
      <div className="fullscreen">
        <div className="ob-slide" style={{ maxWidth:640 }}>
          <span className="section-label">{t("Step 4 of 4")}</span>
          <div className="t-display">{t("Point at a folder of images")}</div>
          <div className="dropzone">
            <div style={{ width:64, height:64, borderRadius:18, background:"var(--surface-2)", display:"flex", alignItems:"center", justifyContent:"center" }}><Icon name="upload" size={28} style={{ color:"var(--primary)" }} /></div>
            <div className="t-subtitle">{t("Drop an image folder here")}</div>
            <div className="t-caption">{t("JPG, PNG, WebP · or browse to select")}</div>
            <button className="btn btn-secondary" style={{ marginTop:8 }}><Icon name="folder" size={15}/>{t("Browse folders")}</button>
          </div>
          <div className="row gap-md">
            <button className="btn btn-ghost" onClick={()=>setStep(0)}>{t("Back")}</button>
            <button className="btn btn-primary lg" onClick={onDone}>{t("Open sample project")}<Icon name="arrowRight" size={16}/></button>
          </div>
        </div>
      </div>
    );
  }
  const s = slides[step];
  return (
    <div className="fullscreen">
      <div className="ob-slide">
        <div style={{ width:104, height:104, borderRadius:28, background:"linear-gradient(135deg,var(--primary-hover),var(--primary-active))", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"var(--e3)" }}>
          <Icon name={s.icon} size={48} style={{ color:"#fff" }} />
        </div>
        <div className="t-display">{s.title}</div>
        <div className="t-subtitle tsec" style={{ fontWeight:400, textWrap:"pretty" }}>{s.body}</div>
        <div className="ob-dots" style={{ marginTop:8 }}>
          {slides.map((_,i)=><span key={i} className={"ob-dot"+(i===step?" on":"")} />)}
          <span className={"ob-dot"+(false?" on":"")} />
        </div>
        <div className="row gap-md" style={{ marginTop:8 }}>
          <button className="btn btn-ghost" onClick={onDone}>{t("Skip")}</button>
          <button className="btn btn-primary lg" onClick={()=>setStep(step+1)}>{step===slides.length-1?t("Get started"):t("Next")}<Icon name="arrowRight" size={16}/></button>
        </div>
      </div>
    </div>
  );
}

function ProjectManager({ onOpen, onNew }) {
  return (
    <div className="fullscreen" style={{ overflow:"auto" }}>
      <div className="titlebar" style={{ WebkitAppRegion:"drag" }}>
        <div className="tb-traffic"><span style={{background:"#FF5F57"}}/><span style={{background:"#FEBC2E"}}/><span style={{background:"#28C840"}}/></div>
        <div className="tb-logo" style={{ marginLeft:8 }}><span className="mark"><Icon name="scan" size={14}/></span>LabelStudio</div>
        <div className="grow" />
      </div>
      <div style={{ maxWidth:1080, margin:"0 auto", width:"100%", padding:"var(--sp-3xl) var(--sp-xl)" }}>
        <div className="row" style={{ justifyContent:"space-between", alignItems:"flex-end", marginBottom:"var(--sp-xl)" }}>
          <div className="col gap-sm"><span className="t-display">{t("Projects")}</span><span className="t-body tsec">{isRTL()?"۶ پروژه · آخرین باز شدن ۲ دقیقه پیش":"6 projects · last opened 2 minutes ago"}</span></div>
          <div className="row gap-sm">
            <label className="field" style={{ width:220 }}><Icon name="search" size={15} className="ic"/><input placeholder={t("Search projects…")} /></label>
            <button className="btn btn-primary" onClick={onNew}><Icon name="plus" size={15}/>{t("New project")}</button>
          </div>
        </div>
        <div className="pm-grid" style={{ padding:0 }}>
          {PROJECTS.map(p=>{
            const pct = Math.round(p.labeled/p.count*100);
            return (
              <div key={p.id} className="pm-card" onClick={()=>onOpen(p)}>
                <div className="row" style={{ justifyContent:"space-between", alignItems:"flex-start" }}>
                  <div className="col gap-sm" style={{ minWidth:0 }}>
                    <span className="t-subtitle" style={{ whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{p.name}</span>
                    <span className="t-caption">{p.count.toLocaleString()} {t("images")} · {p.fmt}</span>
                  </div>
                  <Ring pct={pct} size={42}><span className="tnum" style={{ fontSize:10 }}>{pct}%</span></Ring>
                </div>
                <div className="pm-thumbs">
                  {p.thumbs.map((t,i)=><Img key={i} src={photoUrl(t,160)} label="img" />)}
                </div>
                <div className="row" style={{ justifyContent:"space-between", marginTop:"var(--sp-md)" }}>
                  <span className="t-caption">{p.labeled.toLocaleString()} {t("labeled")}</span>
                  <span className="t-caption">{p.opened}</span>
                </div>
              </div>
            );
          })}
          <button className="pm-card pm-new" onClick={onNew}>
            <div style={{ width:48, height:48, borderRadius:14, background:"var(--surface-2)", display:"flex", alignItems:"center", justifyContent:"center" }}><Icon name="plus" size={24}/></div>
            <span className="t-body-strong">{t("New project")}</span>
            <span className="t-caption">{t("Start from a folder of images")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Onboarding, ProjectManager });
