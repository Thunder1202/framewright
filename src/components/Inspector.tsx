import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { AnimKind, BlendMode, Clip, DEFAULT_ADJUST, DEFAULT_CHROMA, DEFAULT_CROP, DEFAULT_MASK, KeyProp, Mask, Project, RampKind, TextStyle } from '../types';
import { editClips, setCanvas, setClipProp, setClipSpeed, stabiliseSelected, toggleKeyframe } from '../actions';
import { hasKeys, keyAt, resolveClip } from '../lib/keyframes';
import { RAMPS } from '../lib/ramp';
import { coverScale } from '../engine/compose';
import { clipEnd, findClip, formatTime, projectDuration } from '../lib/timeline';
import { FILTERS } from '../lib/filters';
import { Field, Icon } from './ui';
import { TRANSITIONS } from './LeftPanel';

type Tab = 'look' | 'text' | 'adjust' | 'audio' | 'speed' | 'motion';

const FONTS: { name: string; css: string }[] = [
  { name: 'Segoe UI', css: 'Segoe UI, system-ui, sans-serif' },
  { name: 'Arial', css: 'Arial, Helvetica, sans-serif' },
  { name: 'Impact', css: 'Impact, Haettenschweiler, sans-serif' },
  { name: 'Georgia', css: 'Georgia, Times New Roman, serif' },
  { name: 'Times New Roman', css: 'Times New Roman, Times, serif' },
  { name: 'Trebuchet', css: 'Trebuchet MS, sans-serif' },
  { name: 'Verdana', css: 'Verdana, Geneva, sans-serif' },
  { name: 'Consolas', css: 'Consolas, Courier New, monospace' },
  { name: 'Comic Sans', css: 'Comic Sans MS, cursive' },
  { name: 'Brush Script', css: 'Brush Script MT, Segoe Script, cursive' },
];

const ANIMS: { id: AnimKind; name: string }[] = [
  { id: 'none', name: 'None' },
  { id: 'fade', name: 'Fade' },
  { id: 'slide-left', name: 'Slide from right' },
  { id: 'slide-right', name: 'Slide from left' },
  { id: 'slide-up', name: 'Slide from below' },
  { id: 'slide-down', name: 'Slide from above' },
  { id: 'zoom-in', name: 'Grow' },
  { id: 'zoom-out', name: 'Shrink' },
  { id: 'spin', name: 'Spin' },
];

const BLENDS: { id: BlendMode; name: string }[] = [
  { id: 'normal', name: 'Normal' },
  { id: 'screen', name: 'Screen (drops black)' },
  { id: 'add', name: 'Add (glow)' },
  { id: 'lighten', name: 'Lighten' },
  { id: 'multiply', name: 'Multiply (drops white)' },
  { id: 'darken', name: 'Darken' },
  { id: 'overlay', name: 'Overlay' },
];

/** Layout settings that can change over time with keyframes. */
const KEYED: { prop: KeyProp; label: string; min: number; max: number; scale: number; suffix?: string; def: number }[] = [
  { prop: 'scale', label: 'Scale', min: 5, max: 400, scale: 100, suffix: '%', def: 1 },
  { prop: 'x', label: 'Position X', min: -100, max: 100, scale: 100, def: 0 },
  { prop: 'y', label: 'Position Y', min: -100, max: 100, scale: 100, def: 0 },
  { prop: 'rotation', label: 'Rotation', min: -180, max: 180, scale: 1, suffix: '°', def: 0 },
  { prop: 'opacity', label: 'Opacity', min: 0, max: 100, scale: 100, suffix: '%', def: 1 },
];

const begin = () => useStore.getState().checkpoint();

function ProjectInfo({ project }: { project: Project }) {
  const clips = project.tracks.reduce((n, t) => n + t.clips.length, 0);
  return (
    <div className="insp-body">
      <h3>Project</h3>
      <dl className="facts">
        <dt>Canvas</dt>
        <dd>
          {project.width} × {project.height}
        </dd>
        <dt>Length</dt>
        <dd>{formatTime(projectDuration(project), project.fps)}</dd>
        <dt>Clips</dt>
        <dd>{clips}</dd>
        <dt>Files</dt>
        <dd>{project.assets.length}</dd>
      </dl>
      <label className="row">
        <span>Frame rate</span>
        <select
          className="select"
          value={project.fps}
          onChange={(e) => useStore.getState().commit((p) => void (p.fps = Number(e.target.value)))}
        >
          {[24, 25, 30, 50, 60].map((f) => (
            <option key={f} value={f}>
              {f} fps
            </option>
          ))}
        </select>
      </label>
      <div className="row">
        <span>Canvas size</span>
        <span className="pair">
          <SizeBox value={project.width} onCommit={(v) => setCanvas(v, project.height)} label="Width" />
          ×
          <SizeBox value={project.height} onCommit={(v) => setCanvas(project.width, v)} label="Height" />
        </span>
      </div>
      <p className="hint">Select a clip on the timeline or in the preview to edit it here.</p>
    </div>
  );
}

function SizeBox({ value, onCommit, label }: { value: number; onCommit: (v: number) => void; label: string }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const done = () => {
    const v = Math.min(7680, Math.max(16, Math.round(Number(draft))));
    if (Number.isFinite(v) && v !== value) onCommit(v);
    else setDraft(String(value));
  };
  return (
    <input
      className="num"
      type="number"
      aria-label={label}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={done}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

export function Inspector() {
  const project = useStore((s) => s.project);
  const selection = useStore((s) => s.selection);
  const [tab, setTab] = useState<Tab>('look');

  const found = project && selection.length === 1 ? findClip(project, selection[0]) : null;
  const clip = found?.clip ?? null;
  const asset = project && clip ? project.assets.find((a) => a.id === clip.assetId) : undefined;
  // only follow the playhead when something is keyframed, so the panel is not redrawn every frame for nothing
  const time = useStore((s) => (clip && hasKeys(clip) ? s.time : 0));

  const tabs: { id: Tab; label: string }[] = !clip
    ? []
    : clip.kind === 'audio'
      ? [
          { id: 'audio', label: 'Sound' },
          { id: 'speed', label: 'Speed' },
        ]
      : clip.kind === 'text'
        ? [
            { id: 'text', label: 'Text' },
            { id: 'look', label: 'Layout' },
            { id: 'motion', label: 'Motion' },
          ]
        : clip.kind === 'image'
          ? [
              { id: 'look', label: 'Layout' },
              { id: 'adjust', label: 'Adjust' },
              { id: 'motion', label: 'Motion' },
            ]
          : [
              { id: 'look', label: 'Layout' },
              { id: 'adjust', label: 'Adjust' },
              { id: 'audio', label: 'Sound' },
              { id: 'speed', label: 'Speed' },
              { id: 'motion', label: 'Motion' },
            ];
  const active = tabs.some((t) => t.id === tab) ? tab : tabs[0]?.id;

  if (!project) return <aside className="inspector" />;
  if (selection.length > 1) {
    return (
      <aside className="inspector">
        <div className="insp-body">
          <h3>{selection.length} clips selected</h3>
          <p className="hint">Delete, duplicate, copy and mute work on all of them. Select a single clip to change its settings.</p>
        </div>
      </aside>
    );
  }
  if (!clip || !found) {
    return (
      <aside className="inspector">
        <ProjectInfo project={project} />
      </aside>
    );
  }

  const id = clip.id;
  const view = resolveClip(clip, time);
  const local = Math.min(clip.duration, Math.max(0, time - clip.start));
  const mask = (fn: (m: Mask) => void, history = false) =>
    editClips(
      [id],
      (c) => {
        const m = { ...DEFAULT_MASK, ...c.mask };
        fn(m);
        c.mask = m;
      },
      history,
    );
  const live = (fn: (c: Clip) => void) => editClips([id], fn, false);
  const once = (fn: (c: Clip) => void) => editClips([id], fn, true);
  const text = (fn: (t: TextStyle) => void, history = false) => editClips([id], (c) => c.text && fn(c.text), history);
  const prev = found.track.clips.find((c) => c.id !== id && Math.abs(clipEnd(c) - clip.start) < 0.002);

  return (
    <aside className="inspector">
      <div className="insp-title" title={clip.name}>
        <span className={`dot ${clip.kind}`} />
        {clip.name}
      </div>
      <div className="insp-tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={active === t.id} className={active === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="insp-body">
        {active === 'text' && clip.text && (
          <>
            <textarea
              className="textarea"
              value={clip.text.content}
              rows={3}
              aria-label="Text"
              placeholder="Type here"
              onFocus={begin}
              onChange={(e) => text((t) => void (t.content = e.target.value))}
            />
            <label className="row">
              <span>Font</span>
              <select className="select" value={clip.text.font} onChange={(e) => text((t) => void (t.font = e.target.value), true)}>
                {!FONTS.some((f) => f.css === clip.text!.font) && <option value={clip.text.font}>{clip.text.font.split(',')[0]}</option>}
                {FONTS.map((f) => (
                  <option key={f.name} value={f.css}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <Field label="Size" value={clip.text.size} min={1} max={40} step={0.5} digits={1} def={9} onBegin={begin} onChange={(v) => text((t) => void (t.size = v))} />
            <div className="row">
              <span>Style</span>
              <span className="seg">
                <button className={clip.text.bold ? 'on' : ''} aria-pressed={clip.text.bold} onClick={() => text((t) => void (t.bold = !t.bold), true)}>
                  <b>B</b>
                </button>
                <button className={clip.text.italic ? 'on' : ''} aria-pressed={clip.text.italic} onClick={() => text((t) => void (t.italic = !t.italic), true)}>
                  <i>I</i>
                </button>
                {(['left', 'center', 'right'] as const).map((a) => (
                  <button key={a} className={clip.text!.align === a ? 'on' : ''} aria-pressed={clip.text!.align === a} onClick={() => text((t) => void (t.align = a), true)}>
                    {a[0].toUpperCase()}
                  </button>
                ))}
              </span>
            </div>
            <label className="row">
              <span>Colour</span>
              <input type="color" value={clip.text.color} onPointerDown={begin} onChange={(e) => text((t) => void (t.color = e.target.value))} />
            </label>
            <label className="row">
              <span>Outline colour</span>
              <input type="color" value={clip.text.stroke} onPointerDown={begin} onChange={(e) => text((t) => void (t.stroke = e.target.value))} />
            </label>
            <Field label="Outline" value={clip.text.strokeWidth} min={0} max={20} def={0} onBegin={begin} onChange={(v) => text((t) => void (t.strokeWidth = v))} />
            <label className="row">
              <span>Background</span>
              <span className="pair">
                <input type="checkbox" checked={clip.text.backgroundOn} onChange={(e) => text((t) => void (t.backgroundOn = e.target.checked), true)} />
                <input type="color" value={clip.text.background} onPointerDown={begin} onChange={(e) => text((t) => void (t.background = e.target.value))} />
              </span>
            </label>
            <label className="row">
              <span>Drop shadow</span>
              <input type="checkbox" checked={clip.text.shadow} onChange={(e) => text((t) => void (t.shadow = e.target.checked), true)} />
            </label>
          </>
        )}

        {active === 'look' && (
          <>
            {KEYED.map((k) => {
              const keyed = hasKeys(clip, k.prop);
              const here = keyed && keyAt(clip, k.prop, local, project.fps);
              return (
                <div className="kf-row" key={k.prop}>
                  <Field label={k.label} value={view[k.prop]} min={k.min} max={k.max} scale={k.scale} suffix={k.suffix} def={k.def} onBegin={begin} onChange={(v) => setClipProp(id, k.prop, v)} />
                  <button
                    className={`kf${here ? ' on' : ''}${keyed ? ' has' : ''}`}
                    aria-pressed={here}
                    aria-label={`${k.label} keyframe`}
                    title={here ? 'Remove this keyframe' : keyed ? 'Add a keyframe here' : 'Animate: add a keyframe at the playhead'}
                    onClick={() => toggleKeyframe(id, k.prop)}
                  >
                    ◆
                  </button>
                </div>
              );
            })}
            {hasKeys(clip) && <p className="hint">Move the playhead, change a value, and it becomes a new keyframe. The clip glides between them.</p>}
            <label className="row">
              <span>Blend</span>
              <select className="select" value={clip.blend ?? 'normal'} onChange={(e) => once((c) => void (c.blend = e.target.value as BlendMode))}>
                {BLENDS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            {clip.kind !== 'text' && (
              <>
                <h4>Crop</h4>
                {(
                  [
                    ['l', 'Left'],
                    ['r', 'Right'],
                    ['t', 'Top'],
                    ['b', 'Bottom'],
                  ] as const
                ).map(([key, label]) => (
                  <Field
                    key={key}
                    label={label}
                    value={clip.crop?.[key] ?? 0}
                    min={0}
                    max={90}
                    scale={100}
                    suffix="%"
                    def={0}
                    onBegin={begin}
                    onChange={(v) =>
                      live((c) => {
                        const crop = { ...DEFAULT_CROP, ...c.crop };
                        const other = key === 'l' ? crop.r : key === 'r' ? crop.l : key === 't' ? crop.b : crop.t;
                        // the two sides of one axis may not meet
                        crop[key] = Math.max(0, Math.min(v, 0.95 - other));
                        c.crop = crop;
                      })
                    }
                  />
                ))}
              </>
            )}
            {clip.kind !== 'text' && (
              <>
                <h4>Mask</h4>
                <label className="row">
                  <span>Shape</span>
                  <select className="select" value={clip.mask?.shape ?? 'none'} onChange={(e) => mask((m) => void (m.shape = e.target.value as Mask['shape']), true)}>
                    <option value="none">None</option>
                    <option value="ellipse">Oval</option>
                    <option value="rect">Rectangle</option>
                  </select>
                </label>
                {clip.mask && clip.mask.shape !== 'none' && (
                  <>
                    <Field label="Width" value={clip.mask.w} min={2} max={150} scale={100} suffix="%" def={DEFAULT_MASK.w} onBegin={begin} onChange={(v) => mask((m) => void (m.w = v))} />
                    <Field label="Height" value={clip.mask.h} min={2} max={150} scale={100} suffix="%" def={DEFAULT_MASK.h} onBegin={begin} onChange={(v) => mask((m) => void (m.h = v))} />
                    <Field label="Across" value={clip.mask.x} min={-50} max={50} scale={100} def={0} onBegin={begin} onChange={(v) => mask((m) => void (m.x = v))} />
                    <Field label="Down" value={clip.mask.y} min={-50} max={50} scale={100} def={0} onBegin={begin} onChange={(v) => mask((m) => void (m.y = v))} />
                    <Field label="Soft edge" value={clip.mask.feather} min={0} max={100} def={DEFAULT_MASK.feather} onBegin={begin} onChange={(v) => mask((m) => void (m.feather = v))} />
                    <label className="row">
                      <span>Show the outside instead</span>
                      <input type="checkbox" checked={clip.mask.invert} onChange={(e) => mask((m) => void (m.invert = e.target.checked), true)} />
                    </label>
                  </>
                )}
              </>
            )}
            <div className="btn-row">
              {clip.kind !== 'text' && (
                <>
                  <button className="btn secondary" onClick={() => once((c) => Object.assign(c, { scale: 1, x: 0, y: 0 }))}>
                    Fit
                  </button>
                  <button className="btn secondary" onClick={() => once((c) => Object.assign(c, { scale: coverScale(project, c), x: 0, y: 0 }))}>
                    Fill
                  </button>
                </>
              )}
              <button className="btn secondary" onClick={() => once((c) => void (c.flipH = !c.flipH))} title="Mirror">
                <Icon name="flip" /> Flip
              </button>
              <button className="btn secondary" onClick={() => once((c) => Object.assign(c, { scale: 1, x: 0, y: 0, rotation: 0, opacity: 1, flipH: false, blend: 'normal', crop: { ...DEFAULT_CROP }, mask: { ...DEFAULT_MASK }, keys: undefined }))}>
                <Icon name="reset" /> Reset
              </button>
            </div>
          </>
        )}

        {active === 'adjust' && (
          <>
            <label className="row">
              <span>Look</span>
              <select className="select" value={clip.filter} onChange={(e) => once((c) => void (c.filter = e.target.value))}>
                {FILTERS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            {(
              [
                ['brightness', 'Brightness', -100, 100],
                ['contrast', 'Contrast', -100, 100],
                ['saturation', 'Saturation', -100, 100],
                ['temperature', 'Warmth', -100, 100],
                ['hue', 'Hue', -100, 100],
                ['vignette', 'Vignette', 0, 100],
                ['blur', 'Blur', 0, 100],
              ] as const
            ).map(([key, label, min, max]) => (
              <Field key={key} label={label} value={clip.adjust[key]} min={min} max={max} def={0} onBegin={begin} onChange={(v) => live((c) => void (c.adjust[key] = v))} />
            ))}
            <h4>Green screen</h4>
            <label className="row">
              <span>Remove a colour</span>
              <span className="pair">
                <input
                  type="checkbox"
                  checked={!!clip.chroma?.on}
                  onChange={(e) => once((c) => void (c.chroma = { ...DEFAULT_CHROMA, ...c.chroma, on: e.target.checked }))}
                />
                <input
                  type="color"
                  aria-label="Colour to remove"
                  value={clip.chroma?.color ?? DEFAULT_CHROMA.color}
                  onPointerDown={begin}
                  onChange={(e) => live((c) => void (c.chroma = { ...DEFAULT_CHROMA, ...c.chroma, color: e.target.value }))}
                />
              </span>
            </label>
            {clip.chroma?.on && (
              <>
                <Field label="Tolerance" value={clip.chroma.tolerance} min={0} max={100} def={DEFAULT_CHROMA.tolerance} onBegin={begin} onChange={(v) => live((c) => void (c.chroma = { ...DEFAULT_CHROMA, ...c.chroma, tolerance: v }))} />
                <Field label="Soft edge" value={clip.chroma.softness} min={0} max={100} def={DEFAULT_CHROMA.softness} onBegin={begin} onChange={(v) => live((c) => void (c.chroma = { ...DEFAULT_CHROMA, ...c.chroma, softness: v }))} />
                <p className="hint">Put this clip on a layer above the background you want to show through.</p>
              </>
            )}
            {clip.kind === 'video' && (
              <>
                <h4>Shaky footage</h4>
                <div className="btn-row">
                  <button className="btn secondary" onClick={() => void stabiliseSelected()}>
                    {clip.stab ? 'Measure again' : 'Steady the shot'}
                  </button>
                  {clip.stab && (
                    <button className="btn secondary" onClick={() => once((c) => void (c.stab = undefined))}>
                      Remove
                    </button>
                  )}
                </div>
                <p className="hint">
                  {clip.stab
                    ? `Steadied, zoomed in ${Math.round((clip.stab.zoom - 1) * 100)}% to hide the edges.`
                    : 'Smooths out hand-held wobble. It takes out sliding shake, not twisting.'}
                </p>
              </>
            )}
            <div className="btn-row">
              <button className="btn secondary" onClick={() => once((c) => Object.assign(c, { adjust: { ...DEFAULT_ADJUST }, filter: 'none', chroma: { ...DEFAULT_CHROMA } }))}>
                <Icon name="reset" /> Reset look
              </button>
            </div>
          </>
        )}

        {active === 'audio' &&
          (clip.kind === 'video' && asset && !asset.hasAudio ? (
            <p className="hint">This clip has no sound.</p>
          ) : (
            <>
              <Field label="Volume" value={clip.volume} min={0} max={200} scale={100} suffix="%" def={1} onBegin={begin} onChange={(v) => live((c) => void (c.volume = v))} />
              <label className="row">
                <span>Mute</span>
                <input type="checkbox" checked={clip.muted} onChange={(e) => once((c) => void (c.muted = e.target.checked))} />
              </label>
              <Field label="Fade in" value={clip.fadeIn} min={0} max={Math.min(10, clip.duration)} step={0.1} digits={1} suffix="s" def={0} onBegin={begin} onChange={(v) => live((c) => void (c.fadeIn = v))} />
              <Field label="Fade out" value={clip.fadeOut} min={0} max={Math.min(10, clip.duration)} step={0.1} digits={1} suffix="s" def={0} onBegin={begin} onChange={(v) => live((c) => void (c.fadeOut = v))} />
            </>
          ))}

        {active === 'speed' && (
          <>
            <Field label="Speed" value={clip.speed} min={0.1} max={8} step={0.05} digits={2} suffix="×" def={1} onBegin={begin} onChange={(v) => setClipSpeed(id, v, false)} />
            <div className="btn-row">
              {[0.25, 0.5, 1, 1.5, 2, 4].map((s) => (
                <button key={s} className={`btn secondary${Math.abs(clip.speed - s) < 0.001 ? ' active' : ''}`} onClick={() => setClipSpeed(id, s)}>
                  {s}×
                </button>
              ))}
            </div>
            <label className="row">
              <span>Speed shape</span>
              <select className="select" value={clip.ramp ?? 'none'} onChange={(e) => once((c) => void (c.ramp = e.target.value as RampKind))}>
                {RAMPS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="row">
              <span>Play backwards</span>
              <input type="checkbox" checked={!!clip.reversed} onChange={(e) => once((c) => void (c.reversed = e.target.checked))} />
            </label>
            {clip.reversed && <p className="hint">Backwards sound is silent in the preview here, but it is in the exported file.</p>}
            <p className="hint">
              Length on the timeline: {clip.duration.toFixed(2)}s. Sound follows the speed, so faster is higher pitched. Later clips on the track move over if this one grows.
            </p>
          </>
        )}

        {active === 'motion' && (
          <>
            <h4>Arrive</h4>
            <label className="row">
              <span>Animation</span>
              <select className="select" value={clip.animIn.kind} onChange={(e) => once((c) => void (c.animIn.kind = e.target.value as AnimKind))}>
                {ANIMS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            {clip.animIn.kind !== 'none' && (
              <Field label="Length" value={clip.animIn.duration} min={0.1} max={Math.max(0.1, Math.min(5, clip.duration))} step={0.1} digits={1} suffix="s" def={0.5} onBegin={begin} onChange={(v) => live((c) => void (c.animIn.duration = v))} />
            )}
            <h4>Leave</h4>
            <label className="row">
              <span>Animation</span>
              <select className="select" value={clip.animOut.kind} onChange={(e) => once((c) => void (c.animOut.kind = e.target.value as AnimKind))}>
                {ANIMS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            {clip.animOut.kind !== 'none' && (
              <Field label="Length" value={clip.animOut.duration} min={0.1} max={Math.max(0.1, Math.min(5, clip.duration))} step={0.1} digits={1} suffix="s" def={0.5} onBegin={begin} onChange={(v) => live((c) => void (c.animOut.duration = v))} />
            )}
            <h4>Transition from the clip before</h4>
            {prev ? (
              <>
                <label className="row">
                  <span>Style</span>
                  <select className="select" value={clip.transition.kind} onChange={(e) => once((c) => void (c.transition.kind = e.target.value as Clip['transition']['kind']))}>
                    {TRANSITIONS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                {clip.transition.kind !== 'none' && (
                  <Field label="Length" value={clip.transition.duration} min={0.1} max={Math.max(0.1, Math.min(3, clip.duration))} step={0.1} digits={1} suffix="s" def={0.5} onBegin={begin} onChange={(v) => live((c) => void (c.transition.duration = v))} />
                )}
              </>
            ) : (
              <p className="hint">Needs another clip touching the start of this one on the same track.</p>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
