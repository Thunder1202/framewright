import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { Clip, Project, Track } from '../types';
import * as T from '../lib/timeline';
import { getPeaks, PEAK_RATE } from '../lib/media';
import { keyTimes } from '../lib/keyframes';
import { player } from '../engine/player';
import * as A from '../actions';
import { assetsIn, countInside } from '../lib/compound';
import { Icon, IconButton } from './ui';

const HEAD_W = 132;
const S = () => useStore.getState();

function rulerStep(zoom: number, fps: number): number {
  const steps = [1 / fps, 2 / fps, 5 / fps, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800];
  return steps.find((s) => s * zoom >= 64) ?? 3600;
}

function rulerLabel(t: number, step: number, fps: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  if (step < 0.5) {
    const f = Math.round((t % 1) * fps);
    return `${m}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
  }
  const frac = step < 1 ? `.${Math.round((t % 1) * 10)}` : '';
  return `${m}:${String(s).padStart(2, '0')}${frac}`;
}

/** Sound drawn along a clip. */
const Waveform = memo(function Waveform({ clip, width, height }: { clip: Clip; width: number; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const version = useStore((s) => s.mediaVersion);
  const w = Math.max(1, Math.min(4000, Math.floor(width)));
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !clip.assetId) return;
    canvas.width = w;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, w, height);
    const peaks = getPeaks(clip.assetId);
    if (!peaks) return;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    const span = clip.duration * clip.speed;
    const mid = height / 2;
    for (let x = 0; x < w; x++) {
      const xs = clip.reversed ? w - 1 - x : x;
      const a = Math.floor((clip.offset + (xs / w) * span) * PEAK_RATE);
      const b = Math.max(a + 1, Math.floor((clip.offset + ((xs + 1) / w) * span) * PEAK_RATE));
      let m = 0;
      for (let i = a; i < b && i < peaks.length; i++) if (peaks[i] > m) m = peaks[i];
      const h = Math.max(1, m * clip.volume * (height - 4));
      ctx.fillRect(x, mid - h / 2, 1, h);
    }
  }, [clip.assetId, clip.offset, clip.duration, clip.speed, clip.volume, clip.reversed, w, height, version]);
  return <canvas ref={ref} className="wave" />;
});

function Playhead() {
  const time = useStore((s) => s.time);
  const zoom = useStore((s) => s.zoom);
  return (
    <div className="playhead" style={{ left: HEAD_W + time * zoom }}>
      <span />
    </div>
  );
}

function trackLabel(p: Project, track: Track): string {
  const same = p.tracks.filter((t) => t.kind === track.kind);
  const i = same.indexOf(track);
  if (track.kind === 'audio') return `Audio ${i + 1}`;
  const fromBottom = same.length - i;
  return fromBottom === 1 ? 'Main' : `Layer ${fromBottom}`;
}

export function Timeline() {
  const project = useStore((s) => s.project)!;
  const selection = useStore((s) => s.selection);
  const zoom = useStore((s) => s.zoom);
  const snapping = useStore((s) => s.snapping);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const playing = useStore((s) => s.playing);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewW, setViewW] = useState(800);
  const [guide, setGuide] = useState<number | null>(null);
  const [dragKind, setDragKind] = useState<Track['kind'] | null>(null);
  const [dropTrack, setDropTrack] = useState<string | null>(null);

  const duration = T.projectDuration(project);
  const laneW = Math.max(viewW - HEAD_W, (duration + 15) * zoom);
  const selected = new Set(selection);
  const hasSel = selection.length > 0;
  const hasGroup = !!project && project.tracks.some((t) => t.clips.some((c) => c.kind === 'compound' && selection.includes(c.id)));

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewW(el.clientWidth));
    ro.observe(el);
    setViewW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // keep the playhead in view while playing
  useEffect(() => {
    if (!playing) return;
    return useStore.subscribe((s) => {
      const el = scrollRef.current;
      if (!el || !s.playing) return;
      const x = s.time * s.zoom;
      const visible = el.clientWidth - HEAD_W;
      if (x < el.scrollLeft || x > el.scrollLeft + visible - 40) el.scrollLeft = Math.max(0, x - 80);
    });
  }, [playing]);

  // ctrl + wheel zooms around the pointer
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const z0 = S().zoom;
      const z1 = T.clamp(z0 * (e.deltaY < 0 ? 1.2 : 1 / 1.2), 4, 600);
      const px = e.clientX - el.getBoundingClientRect().left - HEAD_W;
      const t = (el.scrollLeft + px) / z0;
      useStore.setState({ zoom: z1 });
      requestAnimationFrame(() => {
        el.scrollLeft = Math.max(0, t * z1 - px);
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const timeAt = (clientX: number): number => {
    const el = scrollRef.current!;
    const x = clientX - el.getBoundingClientRect().left - HEAD_W + el.scrollLeft;
    return Math.max(0, x / S().zoom);
  };

  const scrub = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    player.pause();
    const go = (x: number) => {
      const p = S().project!;
      let t = timeAt(x);
      if (S().snapping) t = T.snapTime(t, T.snapPoints(p, null, -1).slice(2), 6 / S().zoom).t;
      player.seek(T.snapFrame(t, p.fps));
    };
    go(e.clientX);
    const move = (ev: PointerEvent) => go(ev.clientX);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const trackUnder = (x: number, y: number): { id?: string; fresh?: Track['kind'] } => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const row = el?.closest('[data-track]') as HTMLElement | null;
    if (row) return { id: row.dataset.track };
    const zone = el?.closest('[data-newtrack]') as HTMLElement | null;
    if (zone) return { fresh: zone.dataset.newtrack as Track['kind'] };
    return {};
  };

  const dragClip = (e: React.PointerEvent, clip: Clip, track: Track, mode: 'move' | 'l' | 'r') => {
    if (e.button !== 0) return;
    e.stopPropagation();
    // Shift or Ctrl adds to the selection, like a file manager
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      S().select(selected.has(clip.id) ? selection.filter((i) => i !== clip.id) : [...selection, clip.id]);
      return;
    }
    if (!selected.has(clip.id)) S().select([clip.id]);
    if (track.locked) return;
    e.preventDefault();

    const x0 = e.clientX;
    const y0 = e.clientY;
    const orig = structuredClone(clip);
    const asset = project.assets.find((a) => a.id === clip.assetId);
    let began = false;
    let fresh: Track['kind'] | undefined;

    const move = (ev: PointerEvent) => {
      if (!began) {
        if (Math.abs(ev.clientX - x0) < 3 && Math.abs(ev.clientY - y0) < 3) return;
        began = true;
        S().checkpoint();
        if (mode === 'move') setDragKind(track.kind);
      }
      const st = S();
      const p = st.project!;
      const dx = (ev.clientX - x0) / st.zoom;
      const pts = st.snapping && !ev.altKey ? T.snapPoints(p, clip.id, st.time) : [];
      const thr = 8 / st.zoom;
      let hit: number | null = null;

      if (mode === 'move') {
        let ns = orig.start + dx;
        const a = T.snapTime(ns, pts, thr);
        const b = T.snapTime(ns + orig.duration, pts, thr);
        if (a.hit !== null && (b.hit === null || Math.abs(a.t - ns) <= Math.abs(b.t - (ns + orig.duration)))) {
          ns = a.t;
          hit = a.hit;
        } else if (b.hit !== null) {
          ns = b.t - orig.duration;
          hit = b.hit;
        }
        ns = Math.max(0, T.snapFrame(ns, p.fps));
        const under = trackUnder(ev.clientX, ev.clientY);
        fresh = under.fresh === track.kind ? under.fresh : undefined;
        st.mutate((d) => {
          const f = T.findClip(d, clip.id);
          if (!f) return;
          let tr = f.track;
          const dest = under.id ? d.tracks.find((t) => t.id === under.id) : undefined;
          if (dest && dest.id !== tr.id && dest.kind === tr.kind && !dest.locked) {
            tr.clips.splice(f.ci, 1);
            dest.clips.push(f.clip);
            tr = dest;
          }
          f.clip.start = T.findFreeStart(tr, ns, f.clip.duration, f.clip.id);
          T.sortClips(tr);
        });
      } else {
        st.mutate((d) => {
          const f = T.findClip(d, clip.id);
          if (!f) return;
          const { prevEnd, nextStart } = T.neighbours(f.track, clip.id);
          let next: Clip;
          if (mode === 'l') {
            const s = T.snapTime(orig.start + dx, pts, thr);
            hit = s.hit;
            next = T.trimStart(orig, T.snapFrame(s.t, d.fps), prevEnd, d.fps);
          } else {
            const s = T.snapTime(orig.start + orig.duration + dx, pts, thr);
            hit = s.hit;
            next = T.trimEnd(orig, T.snapFrame(s.t, d.fps), nextStart, d.fps, asset);
          }
          f.clip.start = next.start;
          f.clip.duration = next.duration;
          f.clip.offset = next.offset;
          if (next.keys) f.clip.keys = structuredClone(next.keys);
        });
      }
      setGuide(hit);
    };

    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setGuide(null);
      setDragKind(null);
      // a plain click on one of several selected clips picks just that one
      if (!began && selected.has(clip.id) && selection.length > 1) S().select([clip.id]);
      if (began && mode === 'move' && fresh) {
        S().mutate((d) => {
          const f = T.findClip(d, clip.id);
          if (!f) return;
          f.track.clips.splice(f.ci, 1);
          const tr = T.newTrack(fresh!);
          tr.clips.push(f.clip);
          if (fresh === 'visual') d.tracks.unshift(tr);
          else d.tracks.push(tr);
        });
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onDropAsset = (e: React.DragEvent, track: Track) => {
    const id = e.dataTransfer.getData('application/x-asset');
    setDropTrack(null);
    if (!id) return;
    e.preventDefault();
    e.stopPropagation();
    const asset = project.assets.find((a) => a.id === id);
    if (!asset) return;
    const kind = asset.kind === 'audio' ? 'audio' : 'visual';
    A.addAssetToTimeline(id, { trackId: kind === track.kind ? track.id : undefined, time: T.snapFrame(timeAt(e.clientX), project.fps) });
  };

  const fit = () => {
    const el = scrollRef.current;
    if (!el || duration <= 0) return;
    useStore.setState({ zoom: T.clamp((el.clientWidth - HEAD_W - 40) / duration, 4, 600) });
    el.scrollLeft = 0;
  };

  const step = rulerStep(zoom, project.fps);
  const ticks: number[] = [];
  for (let t = 0; t * zoom < laneW; t += step) ticks.push(t);

  const visual = project.tracks.filter((t) => t.kind === 'visual');
  const audio = project.tracks.filter((t) => t.kind === 'audio');

  const renderTrack = (track: Track) => (
    <div key={track.id} className={`tl-row ${track.kind}${track.locked ? ' locked' : ''}${track.hidden ? ' hidden' : ''}${dropTrack === track.id ? ' drop' : ''}`} data-track={track.id}>
      <div className="tl-head">
        <span className="tl-name">{trackLabel(project, track)}</span>
        <span className="tl-head-btns">
          {track.kind === 'visual' && (
            <button className={`mini${track.hidden ? ' on' : ''}`} title={track.hidden ? 'Show track' : 'Hide track'} aria-pressed={track.hidden} onClick={() => A.toggleTrack(track.id, 'hidden')}>
              <Icon name={track.hidden ? 'eyeOff' : 'eye'} size={14} />
            </button>
          )}
          <button className={`mini${track.muted ? ' on' : ''}`} title={track.muted ? 'Unmute track' : 'Mute track'} aria-pressed={track.muted} onClick={() => A.toggleTrack(track.id, 'muted')}>
            <Icon name={track.muted ? 'mute' : 'volume'} size={14} />
          </button>
          <button className={`mini${track.locked ? ' on' : ''}`} title={track.locked ? 'Unlock track' : 'Lock track'} aria-pressed={track.locked} onClick={() => A.toggleTrack(track.id, 'locked')}>
            <Icon name={track.locked ? 'lock' : 'unlock'} size={14} />
          </button>
        </span>
      </div>
      <div
        className="tl-lane"
        style={{ width: laneW }}
        onPointerDown={(e) => {
          S().select([]);
          scrub(e);
        }}
        onDragOver={(e) => {
          if (Array.from(e.dataTransfer.types).includes('application/x-asset')) {
            e.preventDefault();
            setDropTrack(track.id);
          }
        }}
        onDragLeave={() => setDropTrack((d) => (d === track.id ? null : d))}
        onDrop={(e) => onDropAsset(e, track)}
      >
        {track.clips.map((c) => {
          const asset = project.assets.find((a) => a.id === (c.kind === 'compound' ? assetsIn(c).find((id) => project.assets.find((x) => x.id === id)?.thumb) : c.assetId));
          const w = Math.max(3, c.duration * zoom);
          const showWave = c.kind === 'audio' || (c.kind === 'video' && asset?.hasAudio && !c.muted);
          const h = track.kind === 'audio' ? 40 : 52;
          return (
            <div
              key={c.id}
              className={`clip ${c.kind}${selected.has(c.id) ? ' sel' : ''}${c.muted && c.kind === 'audio' ? ' muted' : ''}`}
              style={{ left: c.start * zoom, width: w }}
              title={`${c.name}\n${c.duration.toFixed(2)}s${c.speed !== 1 ? ` at ${c.speed}×` : ''}`}
              onPointerDown={(e) => dragClip(e, c, track, 'move')}
            >
              {(c.kind === 'video' || c.kind === 'image' || c.kind === 'compound') && asset?.thumb && (
                <span className="clip-film" style={{ backgroundImage: `url(${asset.thumb})` }} />
              )}
              {showWave && c.assetId && w > 8 && (
                <span className={`clip-wave${c.kind === 'video' ? ' under' : ''}`}>
                  <Waveform clip={c} width={w} height={c.kind === 'video' ? 18 : h - 16} />
                </span>
              )}
              <span className="clip-label">
                {c.transition.kind !== 'none' && <i className="tag" title="Has a transition">⇄</i>}
                {c.kind === 'text' ? c.text?.content.split('\n')[0] || 'Text' : c.name}
                {c.kind === 'compound' && !c.name.startsWith('Group') && <i className="tag">group of {countInside(c)}</i>}
                {c.speed !== 1 && <i className="tag">{Number(c.speed.toFixed(2))}×</i>}
                {c.reversed && <i className="tag">reversed</i>}
                {c.ramp && c.ramp !== 'none' && <i className="tag">ramp</i>}
                {c.stab && <i className="tag">steady</i>}
                {c.muted && c.kind !== 'text' && c.kind !== 'image' && <i className="tag">muted</i>}
              </span>
              {keyTimes(c).map((kt) =>
                kt >= 0 && kt <= c.duration ? <i key={kt} className="kdot" style={{ left: kt * zoom }} title="Keyframe" /> : null,
              )}
              {!track.locked && (
                <>
                  <span className="trim l" onPointerDown={(e) => dragClip(e, c, track, 'l')} />
                  <span className="trim r" onPointerDown={(e) => dragClip(e, c, track, 'r')} />
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <section className="timeline" aria-label="Timeline">
      <div className="tl-toolbar">
        <IconButton icon="undo" label="Undo (Ctrl+Z)" onClick={() => S().undo()} disabled={!canUndo} />
        <IconButton icon="redo" label="Redo (Ctrl+Y)" onClick={() => S().redo()} disabled={!canRedo} />
        <span className="sep" />
        <IconButton icon="split" label="Split at playhead (S)" onClick={A.splitAtPlayhead} />
        <IconButton icon="trash" label="Delete (Del)" onClick={() => A.deleteSelected(false)} disabled={!hasSel} />
        <IconButton icon="ripple" label="Delete and close the gap (Shift+Del)" onClick={() => A.deleteSelected(true)} disabled={!hasSel} />
        <IconButton icon="copy" label="Duplicate (Ctrl+D)" onClick={A.duplicateSelected} disabled={!hasSel} />
        <span className="sep" />
        <button className="btn ghost small" onClick={() => void A.removeSilences()} disabled={selection.length !== 1} title="Cut the quiet parts out of the selected clip">
          <Icon name="silence" /> Remove silences
        </button>
        <button className="btn ghost small" onClick={A.detachAudio} disabled={!hasSel} title="Move the selected clip's sound to its own track">
          <Icon name="detach" /> Detach audio
        </button>
        <button className="btn ghost small" onClick={A.groupSelected} disabled={!hasSel} title="Turn the selected clips into one clip (Ctrl+G)">
          <Icon name="group" /> Group
        </button>
        <button className="btn ghost small" onClick={A.ungroupSelected} disabled={!hasGroup} title="Put a group's clips back on the timeline (Ctrl+Shift+G)">
          <Icon name="ungroup" /> Break apart
        </button>
        <button className="btn ghost small" onClick={() => void A.freezeFrame()} disabled={selection.length !== 1} title="Hold the frame under the playhead for two seconds">
          <Icon name="snow" /> Freeze
        </button>
        <button className="btn ghost small" onClick={A.toggleMarker} title="Add or remove a marker at the playhead (Shift+M)">
          <Icon name="flag" /> Marker
        </button>
        <span className="grow" />
        <button className="btn ghost small" onClick={() => A.addTrack('visual')} title="Add a layer above">
          <Icon name="plus" /> Layer
        </button>
        <button className="btn ghost small" onClick={() => A.addTrack('audio')} title="Add an audio track">
          <Icon name="plus" /> Audio
        </button>
        <span className="sep" />
        <IconButton icon="magnet" label="Snapping (N)" active={snapping} onClick={() => useStore.setState({ snapping: !snapping })} />
        <IconButton icon="zoomOut" label="Zoom out (-)" onClick={() => useStore.setState({ zoom: Math.max(4, zoom / 1.25) })} />
        <input
          className="zoom"
          type="range"
          min={Math.log(4)}
          max={Math.log(600)}
          step={0.01}
          value={Math.log(zoom)}
          aria-label="Timeline zoom"
          onChange={(e) => useStore.setState({ zoom: Math.exp(Number(e.target.value)) })}
        />
        <IconButton icon="zoomIn" label="Zoom in (+)" onClick={() => useStore.setState({ zoom: Math.min(600, zoom * 1.25) })} />
        <IconButton icon="fit" label="Fit the whole timeline" onClick={fit} />
      </div>

      <div className="tl-scroll" ref={scrollRef}>
        <div className="tl-content" style={{ width: HEAD_W + laneW }}>
          <div className="tl-ruler-row">
            <div className="tl-head corner" />
            <div className="tl-ruler" style={{ width: laneW }} onPointerDown={scrub}>
              {ticks.map((t) => (
                <span key={t} className="tick" style={{ left: t * zoom }}>
                  {rulerLabel(t, step, project.fps)}
                </span>
              ))}
              {(project.markers ?? []).map((m, i) => (
                <button
                  key={m.id}
                  className="marker"
                  style={{ left: m.time * zoom }}
                  title={`Marker ${i + 1} at ${T.formatTime(m.time, project.fps)}
Click to go here, double-click to remove`}
                  aria-label={`Marker ${i + 1}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => {
                    player.pause();
                    player.seek(m.time);
                  }}
                  onDoubleClick={() => A.removeMarker(m.id)}
                />
              ))}
            </div>
          </div>
          <div className={`tl-new${dragKind === 'visual' ? ' show' : ''}`} data-newtrack="visual">
            <div className="tl-head" />
            <span>Drop here for a new layer</span>
          </div>
          {visual.map(renderTrack)}
          <div className="tl-gap" />
          {audio.map(renderTrack)}
          <div className={`tl-new${dragKind === 'audio' ? ' show' : ''}`} data-newtrack="audio">
            <div className="tl-head" />
            <span>Drop here for a new audio track</span>
          </div>
          {(project.markers ?? []).map((m) => (
            <div key={m.id} className="markerline" style={{ left: HEAD_W + m.time * zoom }} />
          ))}
          {guide !== null && <div className="snapline" style={{ left: HEAD_W + guide * zoom }} />}
          <Playhead />
          {duration === 0 && <div className="tl-empty">Click a file in the library to add it, or drag it onto a track</div>}
        </div>
      </div>
    </section>
  );
}
