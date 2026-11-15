import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { player } from '../engine/player';
import { clipSize, hitTest, isActive } from '../engine/compose';
import { clamp, findClip, formatTime, projectDuration } from '../lib/timeline';
import { resolveClip, setProp } from '../lib/keyframes';
import { saveStill, setCanvas, stepFrames } from '../actions';
import { IconButton } from './ui';

const ASPECTS: { label: string; w: number; h: number }[] = [
  { label: '16:9 wide', w: 1920, h: 1080 },
  { label: '9:16 vertical', w: 1080, h: 1920 },
  { label: '1:1 square', w: 1080, h: 1080 },
  { label: '4:5 portrait', w: 1080, h: 1350 },
  { label: '4:3 classic', w: 1440, h: 1080 },
  { label: '21:9 cinema', w: 2560, h: 1080 },
];

function Timecode() {
  const time = useStore((s) => s.time);
  const fps = useStore((s) => s.project?.fps ?? 30);
  const total = useStore((s) => (s.project ? projectDuration(s.project) : 0));
  return (
    <span className="timecode" aria-label="Playhead position">
      <b>{formatTime(time, fps)}</b> / {formatTime(total, fps)}
    </span>
  );
}

/** Move, scale and rotate handles for the selected clip, laid over the canvas. */
function TransformBox({ cssW, cssH }: { cssW: number; cssH: number }) {
  const project = useStore((s) => s.project)!;
  const selection = useStore((s) => s.selection);
  const time = useStore((s) => s.time);
  useStore((s) => s.mediaVersion);
  const [guides, setGuides] = useState<{ v: boolean; h: boolean }>({ v: false, h: false });

  if (selection.length !== 1) return null;
  const found = findClip(project, selection[0]);
  if (!found || found.clip.kind === 'audio' || found.track.locked || found.track.hidden) return null;
  if (!isActive(found.clip, time)) return null;
  // where the clip is right now, keyframes included
  const clip = resolveClip(found.clip, time);
  const size = clipSize(project, clip, project.width, project.height, player.sources);
  if (!size) return null;

  const kx = cssW / project.width;
  const ky = cssH / project.height;
  const cx = (0.5 + clip.x) * cssW;
  const cy = (0.5 + clip.y) * cssH;
  const w = size.w * kx;
  const h = size.h * ky;

  const drag = (e: React.PointerEvent, mode: 'move' | 'scale' | 'rotate') => {
    e.preventDefault();
    e.stopPropagation();
    const S = useStore.getState;
    const stage = (e.currentTarget as HTMLElement).closest('.stage-inner') as HTMLElement;
    const rect = stage.getBoundingClientRect();
    if (mode === 'move') {
      // a different clip may sit on top of this one: clicking it selects it instead
      const top = hitTest(project, time, (e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height, player.sources);
      if (top && top.id !== clip.id) {
        S().select([top.id]);
        return;
      }
    }
    const ox = rect.left + cx;
    const oy = rect.top + cy;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const start = { x: clip.x, y: clip.y, scale: clip.scale, rotation: clip.rotation };
    const d0 = Math.hypot(x0 - ox, y0 - oy) || 1;
    const a0 = Math.atan2(y0 - oy, x0 - ox);
    let began = false;
    const move = (ev: PointerEvent) => {
      if (!began) {
        if (Math.abs(ev.clientX - x0) < 2 && Math.abs(ev.clientY - y0) < 2) return;
        began = true;
        S().checkpoint();
      }
      S().mutate((p) => {
        const f = findClip(p, clip.id);
        if (!f) return;
        const local = clamp(time - f.clip.start, 0, f.clip.duration);
        if (mode === 'move') {
          let nx = start.x + (ev.clientX - x0) / cssW;
          let ny = start.y + (ev.clientY - y0) / cssH;
          const sv = Math.abs(nx) < 0.012 && !ev.altKey;
          const sh = Math.abs(ny) < 0.012 && !ev.altKey;
          if (sv) nx = 0;
          if (sh) ny = 0;
          setGuides({ v: sv, h: sh });
          setProp(f.clip, 'x', nx, local, p.fps);
          setProp(f.clip, 'y', ny, local, p.fps);
        } else if (mode === 'scale') {
          const d = Math.hypot(ev.clientX - ox, ev.clientY - oy);
          setProp(f.clip, 'scale', clamp(start.scale * (d / d0), 0.02, 20), local, p.fps);
        } else {
          const a = Math.atan2(ev.clientY - oy, ev.clientX - ox);
          let r = start.rotation + ((a - a0) * 180) / Math.PI;
          const near = Math.round(r / 45) * 45;
          if (Math.abs(r - near) < 3 && !ev.altKey) r = near;
          setProp(f.clip, 'rotation', ((((r + 180) % 360) + 360) % 360) - 180, local, p.fps);
        }
      });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setGuides({ v: false, h: false });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <>
      {guides.v && <div className="guide v" />}
      {guides.h && <div className="guide h" />}
      <div
        className="tbox"
        style={{ left: cx - w / 2, top: cy - h / 2, width: w, height: h, transform: `rotate(${clip.rotation}deg)` }}
        onPointerDown={(e) => drag(e, 'move')}
      >
        {(['nw', 'ne', 'sw', 'se'] as const).map((c) => (
          <span key={c} className={`thandle ${c}`} onPointerDown={(e) => drag(e, 'scale')} />
        ))}
        <span className="trotate" onPointerDown={(e) => drag(e, 'rotate')} title="Rotate" />
      </div>
    </>
  );
}

export function Preview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const width = useStore((s) => s.project?.width ?? 1920);
  const height = useStore((s) => s.project?.height ?? 1080);
  const playing = useStore((s) => s.playing);
  const empty = useStore((s) => !s.project || s.project.tracks.every((t) => t.clips.length === 0));
  const [box, setBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (canvasRef.current) player.attach(canvasRef.current);
    return () => player.detach();
  }, []);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const pad = 24;
      const aw = Math.max(50, el.clientWidth - pad * 2);
      const ah = Math.max(50, el.clientHeight - pad * 2);
      const k = Math.min(aw / width, ah / height);
      setBox({ w: Math.floor(width * k), h: Math.floor(height * k) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width, height]);

  const pick = (e: React.PointerEvent) => {
    const s = useStore.getState();
    if (!s.project) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const hit = hitTest(s.project, s.time, (e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height, player.sources);
    s.select(hit ? [hit.id] : []);
  };

  const aspect = ASPECTS.find((a) => a.w === width && a.h === height);

  return (
    <section className="preview" aria-label="Preview">
      <div className="stage" ref={stageRef}>
        <div className="stage-inner" style={{ width: box.w, height: box.h }}>
          <canvas ref={canvasRef} onPointerDown={pick} />
          {box.w > 0 && <TransformBox cssW={box.w} cssH={box.h} />}
          {empty && <div className="stage-empty">Import a clip and add it to the timeline to begin</div>}
        </div>
      </div>
      <div className="transport">
        <Timecode />
        <span className="grow" />
        <IconButton icon="prev" label="Back one frame (←)" onClick={() => stepFrames(-1)} />
        <button className="btn play" onClick={() => player.toggle()} title="Play / pause (Space)" aria-label={playing ? 'Pause' : 'Play'}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            {playing ? <path d="M7 5h4v14H7zM13 5h4v14h-4z" /> : <path d="M8 5v14l11-7z" />}
          </svg>
        </button>
        <IconButton icon="next" label="Forward one frame (→)" onClick={() => stepFrames(1)} />
        <span className="grow" />
        <select
          className="select"
          aria-label="Canvas shape"
          value={aspect ? `${aspect.w}x${aspect.h}` : 'custom'}
          onChange={(e) => {
            const a = ASPECTS.find((x) => `${x.w}x${x.h}` === e.target.value);
            if (a) setCanvas(a.w, a.h);
          }}
        >
          {!aspect && <option value="custom">{`${width}×${height}`}</option>}
          {ASPECTS.map((a) => (
            <option key={a.label} value={`${a.w}x${a.h}`}>
              {a.label}
            </option>
          ))}
        </select>
        <IconButton icon="camera" label="Save this frame as a picture" onClick={() => void saveStill()} />
        <IconButton icon="fullscreen" label="Full screen" onClick={() => void stageRef.current?.requestFullscreen?.()} />
      </div>
    </section>
  );
}
