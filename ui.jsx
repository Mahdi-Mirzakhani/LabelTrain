/* ============================================================
   ui.jsx — shared primitive components
   ============================================================ */
const { useState, useRef, useEffect, useCallback } = React;
const IconC = window.Icon;

const Kbd = ({ k }) => <span className="kbd">{k}</span>;
const KbdGroup = ({ keys }) => (
  <span className="kbd-group">{keys.map((k, i) => <Kbd key={i} k={k} />)}</span>
);

const Switch = ({ on, onChange }) => (
  <button className={"switch" + (on ? " on" : "")} role="switch" aria-checked={on}
    onClick={() => onChange(!on)}><i /></button>
);

const Checkbox = ({ on, onChange, label }) => (
  <label className="row gap-sm" style={{ cursor:"pointer" }} onClick={(e)=>{e.preventDefault();onChange(!on);}}>
    <span className={"cbx" + (on ? " on" : "")}>{on && <IconC name="check" size={12} />}</span>
    {label && <span className="t-body">{label}</span>}
  </label>
);

const Segmented = ({ value, options, onChange }) => (
  <div className="seg" role="tablist">
    {options.map(o => (
      <button key={o.value} className={value === o.value ? "on" : ""} role="tab"
        aria-selected={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>
    ))}
  </div>
);

const Slider = ({ value, min = 0, max = 1, step = 0.01, onChange, width }) => {
  const ref = useRef(null);
  const pct = ((value - min) / (max - min)) * 100;
  const set = useCallback((clientX) => {
    const r = ref.current.getBoundingClientRect();
    let t = (clientX - r.left) / r.width;
    t = Math.max(0, Math.min(1, t));
    let v = min + t * (max - min);
    v = Math.round(v / step) * step;
    onChange(Math.max(min, Math.min(max, +v.toFixed(4))));
  }, [min, max, step, onChange]);
  const down = (e) => {
    set(e.clientX);
    const mv = (ev) => set(ev.clientX);
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  };
  return (
    <div className="slider" ref={ref} onPointerDown={down} style={{ width, flex: width ? "none" : 1 }}>
      <div className="track"><div className="fill" style={{ width: pct + "%" }} /></div>
      <div className="thumb" style={{ left: pct + "%" }} />
    </div>
  );
};

const Pill = ({ kind = "muted", dot, children }) => (
  <span className={"pill pill-" + kind}>{dot && <span className="dot" style={{ background:"currentColor" }} />}{children}</span>
);

const Dot = ({ color, size = 8 }) => (
  <span style={{ width:size, height:size, borderRadius:"50%", background:color, flex:"none", display:"inline-block" }} />
);

const Ring = ({ pct, size = 44, sw = 4, children }) => {
  const r = (size - sw) / 2, c = 2 * Math.PI * r;
  return (
    <div style={{ position:"relative", width:size, height:size }}>
      <svg className="ring" width={size} height={size}>
        <circle className="ring-bg" cx={size/2} cy={size/2} r={r} fill="none" strokeWidth={sw} />
        <circle className="ring-fg" cx={size/2} cy={size/2} r={r} fill="none" strokeWidth={sw}
          strokeDasharray={c} strokeDashoffset={c * (1 - pct/100)} />
      </svg>
      <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:600 }}>{children}</div>
    </div>
  );
};

// tooltip on hover (icon-only buttons)
const Tip = ({ label, kbd, children }) => {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x:0, y:0 });
  const t = useRef();
  const enter = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ x: r.left + r.width/2, y: r.bottom + 6 });
    t.current = setTimeout(() => setShow(true), 500);
  };
  const leave = () => { clearTimeout(t.current); setShow(false); };
  return (
    <span onMouseEnter={enter} onMouseLeave={leave} style={{ display:"inline-flex" }}>
      {children}
      {show && (
        <div className="tt" style={{ left:pos.x, top:pos.y, transform:"translateX(-50%)" }}>
          {label}{kbd && <span className="kbd">{kbd}</span>}
        </div>
      )}
    </span>
  );
};

// generic image with placeholder fallback
const Img = ({ src, label, className, style }) => {
  const onErr = (e) => { e.target.onerror = null; e.target.src = window.placeholder(label || "image", 600, 400); };
  return <img className={className} style={style} src={src} onError={onErr} alt={label || ""} draggable="false" />;
};

const CodeBlock = ({ children, onCopy }) => {
  const [done, setDone] = useState(false);
  const copy = () => { setDone(true); setTimeout(()=>setDone(false), 1200); onCopy && onCopy(); };
  return (
    <div style={{ position:"relative" }}>
      <div className="codeblock">{children}</div>
      <button className="iconbtn sm" style={{ position:"absolute", top:6, right:6 }} onClick={copy} aria-label="Copy">
        <IconC name={done ? "check" : "copy"} size={14} />
      </button>
    </div>
  );
};

Object.assign(window, { Kbd, KbdGroup, Switch, Checkbox, Segmented, Slider, Pill, Dot, Ring, Tip, Img, CodeBlock });
