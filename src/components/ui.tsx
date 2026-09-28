import { useState, useRef, useCallback, useEffect, useLayoutEffect } from "react";
import type { CSSProperties, ReactNode, RefObject } from "react";
import { Icon } from "./Icon";
import { placeholder } from "../data";
import { cachedThumb, getThumb } from "../lib/thumbs";

export const Kbd = ({ k }: { k: string }) => <span className="kbd">{k}</span>;

export const KbdGroup = ({ keys }: { keys: string[] }) => (
  <span className="kbd-group">{keys.map((k, i) => <Kbd key={i} k={k} />)}</span>
);

interface SwitchProps { on: boolean; onChange: (v: boolean) => void; }
export const Switch = ({ on, onChange }: SwitchProps) => (
  <button className={"switch" + (on ? " on" : "")} role="switch" aria-checked={on}
    onClick={() => onChange(!on)}><i /></button>
);

interface CheckboxProps {
  on: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
}
export const Checkbox = ({ on, onChange, label }: CheckboxProps) => (
  <label className="row gap-sm" style={{ cursor: "pointer" }} onClick={(e) => { e.preventDefault(); onChange(!on); }}>
    <span className={"cbx" + (on ? " on" : "")}>{on && <Icon name="check" size={12} />}</span>
    {label && <span className="t-body">{label}</span>}
  </label>
);

interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
}
export function Segmented<T extends string>({ value, options, onChange }: SegmentedProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const ind = useSlidingIndicator(ref, "button.on", [value, options.map(o => o.value).join("|")]);
  return (
    <div className={"seg" + (ind ? " has-ind" : "")} role="tablist" ref={ref}>
      {ind && <span className="seg-ind" style={{ width: ind.w, transform: `translateX(${ind.x}px)` }} />}
      {options.map(o => (
        <button key={o.value} className={value === o.value ? "on" : ""} role="tab"
          aria-selected={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- motion

/** True when the system asks for less motion; the CSS turns its animations off then too. */
export const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Where the chosen child of a strip sits (`selector`, e.g. "button.on"), so a
 * pill behind the items can slide to it. Measured again whenever `deps`
 * change or the strip resizes — including when a hidden tab shows again.
 */
export function useSlidingIndicator(ref: RefObject<HTMLElement | null>, selector: string, deps: unknown[]) {
  const [ind, setInd] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const measure = () => {
      const el = box.querySelector<HTMLElement>(selector);
      setInd(el && el.offsetWidth ? { x: el.offsetLeft, w: el.offsetWidth } : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ind;
}

/** A number that counts to its value: from 0 when it first shows, then from wherever it was. */
export function CountUp({ value, format = (n: number) => n.toLocaleString(), ms = 650 }: {
  value: number; format?: (n: number) => string; ms?: number;
}) {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? value : 0));
  const cur = useRef(shown);
  useEffect(() => {
    const from = cur.current;
    if (from === value || prefersReducedMotion()) { cur.current = value; setShown(value); return; }
    const t0 = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      const k = Math.min(1, (now - t0) / ms);
      const v = from + (value - from) * (1 - Math.pow(1 - k, 3));
      cur.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <>{format(Math.round(shown))}</>;
}

interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  width?: number;
}
export const Slider = ({ value, min = 0, max = 1, step = 0.01, onChange, width }: SliderProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const pct = ((value - min) / (max - min)) * 100;
  const set = useCallback((clientX: number) => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    let tt = (clientX - r.left) / r.width;
    tt = Math.max(0, Math.min(1, tt));
    let v = min + tt * (max - min);
    v = Math.round(v / step) * step;
    onChange(Math.max(min, Math.min(max, +v.toFixed(4))));
  }, [min, max, step, onChange]);
  const down = (e: React.PointerEvent) => {
    set(e.clientX);
    const mv = (ev: PointerEvent) => set(ev.clientX);
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

interface PillProps { kind?: string; dot?: boolean; children: ReactNode; }
export const Pill = ({ kind = "muted", dot, children }: PillProps) => (
  <span className={"pill pill-" + kind}>
    {dot && <span className="dot" style={{ background: "currentColor" }} />}{children}
  </span>
);

export const Dot = ({ color, size = 8 }: { color: string; size?: number }) => (
  <span style={{
    width: size, height: size, borderRadius: "50%",
    background: color, flex: "none", display: "inline-block",
  }} />
);

interface RingProps { pct: number; size?: number; sw?: number; children?: ReactNode; }
export const Ring = ({ pct, size = 44, sw = 4, children }: RingProps) => {
  const r = (size - sw) / 2, c = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg className="ring" width={size} height={size}>
        <circle className="ring-bg" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={sw} />
        <circle className="ring-fg" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={sw}
          strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex",
        alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 600,
      }}>{children}</div>
    </div>
  );
};

interface TipProps { label: string; kbd?: string; children: ReactNode; }
export const Tip = ({ label, kbd, children }: TipProps) => {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const t = useRef<number | undefined>(undefined);
  const enter = (e: React.MouseEvent<HTMLSpanElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.bottom + 6 });
    t.current = window.setTimeout(() => setShow(true), 500);
  };
  const leave = () => { if (t.current) window.clearTimeout(t.current); setShow(false); };
  return (
    <span onMouseEnter={enter} onMouseLeave={leave} style={{ display: "inline-flex" }}>
      {children}
      {show && (
        <div className="tt" style={{ left: pos.x, top: pos.y, transform: "translateX(-50%)" }}>
          {label}{kbd && <span className="kbd">{kbd}</span>}
        </div>
      )}
    </span>
  );
};

interface ImgProps {
  src: string;
  label?: string;
  className?: string;
  style?: CSSProperties;
  loading?: "eager" | "lazy";
  onLoad?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}
export const Img = ({ src, label, className, style, loading, onLoad }: ImgProps) => {
  const onErr = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    img.onerror = null;
    img.src = placeholder(label || "image", 600, 400);
  };
  return (
    <img className={className} style={style} src={src} loading={loading} decoding="async"
      onError={onErr} onLoad={onLoad} alt={label || ""} draggable="false" />
  );
};

/**
 * Like <Img>, but for the tiny previews in list rows and table cells: resolves
 * a downscaled thumbnail instead of decoding the full-resolution source.
 *
 * Pointing a 48x36 row at a 12-megapixel file still decodes all 12 megapixels;
 * with sixty rows on screen that is gigabytes of bitmap. Falls back to the
 * original URL when a file can't be decoded down (see lib/thumbs).
 */
export const Thumb = ({ src, label, className, style }: ImgProps) => {
  const [resolved, setResolved] = useState<string | null>(() => cachedThumb(src));

  useEffect(() => {
    const hit = cachedThumb(src);
    if (hit) { setResolved(hit); return; }
    let alive = true;
    setResolved(null);
    void getThumb(src).then(url => { if (alive) setResolved(url ?? src); });
    return () => { alive = false; };
  }, [src]);

  const onErr = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    img.onerror = null;
    img.src = placeholder(label || "image", 600, 400);
  };

  // Always render an <img>, even before the thumbnail resolves: the layout for
  // these previews comes from element-type selectors like `.pm-thumbs img`, so
  // a placeholder <span> would collapse the card. A transparent 1x1 keeps the
  // box sized and styled without ever pointing at the full-resolution file.
  return (
    <img className={className} style={style} src={resolved ?? BLANK_PIXEL} decoding="async"
      onError={onErr} alt={label || ""} draggable="false" />
  );
};

const BLANK_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

interface CodeBlockProps { children: ReactNode; onCopy?: () => void; }
export const CodeBlock = ({ children, onCopy }: CodeBlockProps) => {
  const [done, setDone] = useState(false);
  const copy = () => { setDone(true); setTimeout(() => setDone(false), 1200); onCopy?.(); };
  return (
    <div style={{ position: "relative" }}>
      <div className="codeblock">{children}</div>
      <button className="iconbtn sm" style={{ position: "absolute", top: 6, right: 6 }} onClick={copy} aria-label="Copy">
        <Icon name={done ? "check" : "copy"} size={14} />
      </button>
    </div>
  );
};
