import { ReactNode, useEffect } from 'react';

/** Icons drawn for this project: 24px grid, stroked. */
const PATHS: Record<string, string> = {
  play: 'M8 5v14l11-7z',
  pause: 'M8 5v14M16 5v14',
  prev: 'M17 6l-8 6 8 6zM7 6v12',
  next: 'M7 6l8 6-8 6zM17 6v12',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3',
  split: 'M12 3v18M5 8l4 4-4 4M19 8l-4 4 4 4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  ripple: 'M4 7h16M6 7l1 13h10l1-13M9 14h6M9 14l2-2M9 14l2 2',
  copy: 'M9 9h11v11H9zM5 15V4h11',
  magnet: 'M6 4v8a6 6 0 0012 0V4h-4v8a2 2 0 01-4 0V4zM6 8h4M14 8h4',
  zoomIn: 'M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-5-5M8 11h6M11 8v6',
  zoomOut: 'M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-5-5M8 11h6',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  media: 'M3 5h18v14H3zM10 9v6l5-3z',
  audio: 'M9 18V6l10-2v12M9 18a3 3 0 11-6 0 3 3 0 016 0zM19 16a3 3 0 11-6 0 3 3 0 016 0z',
  text: 'M5 6V4h14v2M12 4v16M9 20h6',
  filter: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 3v18M3 12h9',
  transition: 'M3 5h8v14H3zM13 5h8v14h-8zM11 12h2',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z',
  eyeOff: 'M3 3l18 18M10.6 5.2A9.7 9.7 0 0112 5c6 0 10 7 10 7a17 17 0 01-3.2 4M6.5 6.6C3.7 8.6 2 12 2 12s4 7 10 7a9.6 9.6 0 004-.9',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 018 0v3',
  unlock: 'M6 11h12v9H6zM8 11V8a4 4 0 017.5-2',
  volume: 'M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11',
  mute: 'M4 9h4l5-4v14l-5-4H4zM16 9l5 6M21 9l-5 6',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  back: 'M15 5l-7 7 7 7',
  export: 'M12 15V3M7 8l5-5 5 5M4 15v5h16v-5',
  keyboard: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 10a3.5 3.5 0 100 7 3.5 3.5 0 000-7z',
  fullscreen: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  mic: 'M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3zM6 11a6 6 0 0012 0M12 17v4',
  stop: 'M6 6h12v12H6z',
  snow: 'M12 3v18M4 7.5l16 9M20 7.5l-16 9',
  detach: 'M4 8h9v8H4zM16 6v12M19 9v6M22 11v2',
  silence: 'M3 12h3M8 8v8M11 5v14M14 10v4M17 12h1M20 12h1',
  flip: 'M12 3v18M9 7l-5 5 5 5zM15 7l5 5-5 5z',
  reset: 'M4 12a8 8 0 108-8H7M7 4L4 7l3 3',
  flag: 'M6 21V4M6 5h11l-2.5 3.5L17 12H6',
  group: 'M4 4h10v10H4zM10 10h10v10H10z',
  ungroup: 'M3 3h8v8H3zM13 13h8v8h-8z',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01',
  captions: 'M3 6h18v12H3zM7 11h4M7 14h7M14 11h3',
  film: 'M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4',
};

export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const solid = name === 'play' || name === 'stop';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={solid ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={solid ? 0 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name] ?? ''} />
    </svg>
  );
}

export function IconButton({
  icon,
  label,
  onClick,
  active,
  disabled,
  danger,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={`btn icon${active ? ' active' : ''}${danger ? ' danger' : ''}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} />
    </button>
  );
}

interface FieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** double-click the label to return to this */
  def?: number;
  suffix?: string;
  /** shown value = stored value * scale */
  scale?: number;
  digits?: number;
  /** called once before a run of changes, to mark an undo point */
  onBegin: () => void;
  onChange: (v: number) => void;
}

/** A labelled slider with a matching number box. */
export function Field({ label, value, min, max, step = 1, def, suffix, scale = 1, digits = 0, onBegin, onChange }: FieldProps) {
  const shown = Number((value * scale).toFixed(digits));
  const set = (raw: number) => {
    if (Number.isNaN(raw)) return;
    onChange(Math.min(max, Math.max(min, raw)) / scale);
  };
  return (
    <label className="field">
      <span
        className="field-label"
        title={def !== undefined ? 'Double-click to reset' : undefined}
        onDoubleClick={() => {
          if (def === undefined) return;
          onBegin();
          onChange(def);
        }}
      >
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={shown}
        onPointerDown={onBegin}
        onKeyDown={(e) => {
          if (e.key.startsWith('Arrow')) onBegin();
        }}
        onChange={(e) => set(Number(e.target.value))}
      />
      <span className="field-num">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={shown}
          aria-label={label}
          onFocus={onBegin}
          onChange={(e) => set(Number(e.target.value))}
        />
        {suffix && <i>{suffix}</i>}
      </span>
    </label>
  );
}

export function Modal({
  title,
  onClose,
  locked,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  locked?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !locked) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [locked, onClose]);
  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && !locked && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <IconButton icon="close" label="Close" onClick={onClose} disabled={locked} />
        </header>
        {children}
      </div>
    </div>
  );
}
