import { flushSave, useStore } from './store';
import { Asset, Clip, DEFAULT_TEXT, KeyProp, Project, TextStyle, Track, TrackKind, TransitionKind } from './types';
import { loadProject, requestPersistence, saveProject } from './lib/db';
import { ensurePeaks, grabFrame, importFile, loadProjectMedia, mediaUrl, PEAK_RATE, unloadAll, downloadBlob } from './lib/media';
import { setProp, toggleKey } from './lib/keyframes';
import { corrections, estimateShift, STAB_H, STAB_W, toGrey } from './lib/stabilise';
import * as T from './lib/timeline';
import { player } from './engine/player';
import { isActive, sourceTime } from './engine/compose';
import { exportStill } from './engine/export';
import { Cue, parseSubtitles } from './lib/subtitles';
import { assetsIn, groupClips, ungroupClip } from './lib/compound';

const S = () => useStore.getState();
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

// ---------- projects ----------

function enterEditor(p: Project) {
  player.pause();
  useStore.setState({
    project: p,
    view: 'editor',
    past: [],
    future: [],
    selection: [],
    time: 0,
    playing: false,
    zoom: 80,
    dialog: null,
    leftTab: 'media',
  });
}

export async function createProject() {
  const p = T.newProject('Untitled project');
  await saveProject(p);
  unloadAll();
  enterEditor(p);
  void requestPersistence();
}

export async function openProject(id: string) {
  const p = await loadProject(id);
  if (!p) {
    S().notify('That project could not be found', 'error');
    return;
  }
  enterEditor(p);
  const missing = await loadProjectMedia(p);
  useStore.setState({ mediaVersion: S().mediaVersion + 1 });
  if (missing.length) {
    S().notify(`${missing.length} source file${missing.length > 1 ? 's are' : ' is'} missing from storage. Re-import to relink.`, 'error');
  }
}

export async function closeProject() {
  player.pause();
  await flushSave().catch(() => {});
  player.disposeAll();
  unloadAll();
  useStore.setState({ view: 'home', project: null, selection: [], past: [], future: [], time: 0 });
}

// ---------- media ----------

export async function importFiles(files: File[]): Promise<Asset[]> {
  const added: Asset[] = [];
  if (!files.length) return added;
  let i = 0;
  for (const file of files) {
    useStore.setState({ busy: `Importing ${++i} of ${files.length}: ${file.name}` });
    try {
      const asset = await importFile(file, file.name);
      S().mutate((p) => p.assets.push(asset));
      added.push(asset);
    } catch (e) {
      S().notify((e as Error).message, 'error');
    }
  }
  useStore.setState({ busy: null });
  return added;
}

export function removeAsset(assetId: string) {
  const p = S().project;
  if (!p) return;
  const used = p.tracks.some((t) => t.clips.some((c) => assetsIn(c).includes(assetId)));
  if (used) {
    S().notify('That file is used on the timeline. Delete its clips first.', 'error');
    return;
  }
  S().mutate((d) => {
    d.assets = d.assets.filter((a) => a.id !== assetId);
  });
  // history may still reference the asset, so the stored blob is left in place until the project is deleted
}

const visualTracks = (p: Project) => p.tracks.filter((t) => t.kind === 'visual');
const audioTracks = (p: Project) => p.tracks.filter((t) => t.kind === 'audio');
const mainTrack = (p: Project) => {
  const v = visualTracks(p);
  return v[v.length - 1];
};

function addTrackTo(p: Project, kind: TrackKind): Track {
  const tr = T.newTrack(kind);
  if (kind === 'visual') p.tracks.unshift(tr);
  else p.tracks.push(tr);
  return tr;
}

function isEmpty(p: Project) {
  return p.tracks.every((t) => t.clips.length === 0);
}

/** Put an asset on the timeline. With no target, video and images append to the main track. */
export function addAssetToTimeline(assetId: string, at?: { trackId?: string; time?: number }) {
  const p0 = S().project;
  const asset = p0?.assets.find((a) => a.id === assetId);
  if (!p0 || !asset) return;
  const wanted = at?.trackId ? p0.tracks.find((t) => t.id === at.trackId) : undefined;
  if (wanted?.locked) {
    S().notify('That track is locked', 'error');
    return;
  }
  let newId = '';
  S().commit((p) => {
    // whole frames only, so clips butt up against each other exactly
    const duration = asset.kind === 'image' ? 5 : Math.max(1, Math.floor(asset.duration * p.fps + 1e-6)) / p.fps;
    if (asset.kind === 'video' && isEmpty(p)) {
      // first clip sets the canvas, so nothing is letterboxed by surprise
      const k = Math.min(1, 3840 / Math.max(asset.width, asset.height));
      p.width = even(asset.width * k);
      p.height = even(asset.height * k);
    }
    const clip = T.newClip({ kind: asset.kind, assetId, name: asset.name, start: 0, duration });
    const kind: TrackKind = asset.kind === 'audio' ? 'audio' : 'visual';
    let track = at?.trackId ? p.tracks.find((t) => t.id === at.trackId && t.kind === kind) : undefined;
    let start: number;
    if (kind === 'audio') {
      start = at?.time ?? S().time;
      track ??= audioTracks(p).find((t) => !t.locked && !T.overlaps(t, start, duration));
      track ??= addTrackTo(p, 'audio');
    } else if (at?.time !== undefined) {
      start = at.time;
      track ??= mainTrack(p);
    } else {
      track ??= mainTrack(p);
      if (track.locked) track = addTrackTo(p, 'visual');
      start = T.trackEnd(track);
    }
    clip.start = T.placeOnGrid(track, start, duration, p.fps);
    track.clips.push(clip);
    T.sortClips(track);
    newId = clip.id;
  });
  if (newId) S().select([newId]);
}

export function addText(preset: Partial<TextStyle> = {}, name = 'Text') {
  const p0 = S().project;
  if (!p0) return;
  let newId = '';
  S().commit((p) => {
    const start = T.snapFrame(S().time, p.fps);
    const duration = 3;
    const clip = T.newClip({ kind: 'text', name, start, duration, text: { ...DEFAULT_TEXT, ...preset } });
    const v = visualTracks(p);
    // text goes above the main track
    let track = v.slice(0, -1).reverse().find((t) => !t.locked && !T.overlaps(t, start, duration));
    track ??= addTrackTo(p, 'visual');
    track.clips.push(clip);
    T.sortClips(track);
    newId = clip.id;
  });
  S().select([newId]);
}

// ---------- editing ----------

function selectedClips(p: Project): { clip: Clip; track: Track }[] {
  const ids = new Set(S().selection);
  const out: { clip: Clip; track: Track }[] = [];
  for (const track of p.tracks) for (const clip of track.clips) if (ids.has(clip.id)) out.push({ clip, track });
  return out;
}

export function splitAtPlayhead() {
  const p0 = S().project;
  if (!p0) return;
  const t = T.snapFrame(S().time, p0.fps);
  const sel = new Set(S().selection);
  const under = p0.tracks.flatMap((tr) => (tr.locked ? [] : tr.clips.filter((c) => isActive(c, t))));
  const targets = under.filter((c) => sel.has(c.id));
  const ids = new Set((targets.length ? targets : under).map((c) => c.id));
  let did = false;
  const run = (p: Project) => {
    for (const tr of p.tracks) {
      const next: Clip[] = [];
      for (const c of tr.clips) {
        const pair = ids.has(c.id) ? T.splitClip(c, t, p.fps) : null;
        if (pair) {
          next.push(...pair);
          did = true;
        } else next.push(c);
      }
      tr.clips = next;
    }
  };
  // dry run first so an impossible split does not add an empty undo step
  run(structuredClone(p0));
  if (!did) {
    S().notify('Put the playhead inside a clip to split it');
    return;
  }
  S().commit(run);
}

export function deleteSelected(ripple = false) {
  const p0 = S().project;
  if (!p0 || !S().selection.length) return;
  const ids = new Set(S().selection);
  S().commit((p) => {
    for (const tr of p.tracks) {
      if (tr.locked) continue;
      if (ripple) T.rippleDelete(tr, ids);
      else tr.clips = tr.clips.filter((c) => !ids.has(c.id));
    }
    T.pruneTracks(p);
  });
  S().select([]);
}

export function duplicateSelected() {
  const p0 = S().project;
  if (!p0 || !S().selection.length) return;
  const ids = new Set(S().selection);
  const made: string[] = [];
  S().commit((p) => {
    for (const tr of p.tracks) {
      for (const c of [...tr.clips]) {
        if (!ids.has(c.id)) continue;
        const copy: Clip = T.freshIds({ ...structuredClone(c), id: T.uid() });
        copy.start = T.findFreeStart(tr, T.clipEnd(c), c.duration);
        tr.clips.push(copy);
        made.push(copy.id);
      }
      T.sortClips(tr);
    }
  });
  S().select(made);
}

export function copySelected() {
  const p = S().project;
  if (!p) return;
  const clips = selectedClips(p).map((x) => structuredClone(x.clip));
  if (clips.length) {
    useStore.setState({ clipboard: clips });
    S().notify(`Copied ${clips.length} clip${clips.length > 1 ? 's' : ''}`);
  }
}

export function paste() {
  const { clipboard, project } = S();
  if (!project || !clipboard.length) return;
  const base = Math.min(...clipboard.map((c) => c.start));
  const made: string[] = [];
  S().commit((p) => {
    for (const src of clipboard) {
      if (src.assetId && !p.assets.some((a) => a.id === src.assetId)) continue;
      if (assetsIn(src).some((id) => !p.assets.some((a) => a.id === id))) continue;
      const kind: TrackKind = src.kind === 'audio' ? 'audio' : 'visual';
      const start = T.snapFrame(S().time + (src.start - base), p.fps);
      const copy: Clip = T.freshIds({ ...structuredClone(src), id: T.uid(), start });
      let track = p.tracks.find((t) => t.kind === kind && !t.locked && !T.overlaps(t, start, copy.duration));
      track ??= addTrackTo(p, kind);
      track.clips.push(copy);
      T.sortClips(track);
      made.push(copy.id);
    }
  });
  S().select(made);
}

export function trimToPlayhead(side: 'start' | 'end') {
  const p0 = S().project;
  if (!p0) return;
  const t = T.snapFrame(S().time, p0.fps);
  const targets = selectedClips(p0).filter((x) => !x.track.locked && isActive(x.clip, t));
  if (!targets.length) {
    S().notify('Select a clip under the playhead to trim it');
    return;
  }
  const ids = new Set(targets.map((x) => x.clip.id));
  S().commit((p) => {
    for (const tr of p.tracks) {
      tr.clips = tr.clips.map((c) => {
        if (!ids.has(c.id)) return c;
        const asset = p.assets.find((a) => a.id === c.assetId);
        return side === 'start' ? T.trimStart(c, t, 0, p.fps) : T.trimEnd(c, t, Infinity, p.fps, asset);
      });
    }
  });
}

/** Change clips by id. `history` false means the caller already took a checkpoint. */
export function editClips(ids: string[], fn: (c: Clip, p: Project, tr: Track) => void, history = true) {
  if (!ids.length) return;
  const set = new Set(ids);
  const run = (p: Project) => {
    for (const tr of p.tracks) for (const c of tr.clips) if (set.has(c.id)) fn(c, p, tr);
  };
  if (history) S().commit(run);
  else S().mutate(run);
}

export function setClipSpeed(clipId: string, speed: number, history = true) {
  const run = (p: Project) => {
    const f = T.findClip(p, clipId);
    if (f) T.setSpeed(f.track, clipId, speed);
  };
  if (history) S().commit(run);
  else S().mutate(run);
}

export function applyFilter(filterId: string) {
  const p = S().project;
  if (!p) return;
  const ids = selectedClips(p).filter((x) => x.clip.kind === 'video' || x.clip.kind === 'image' || x.clip.kind === 'compound').map((x) => x.clip.id);
  if (!ids.length) {
    S().notify('Select a video, picture or group first');
    return;
  }
  editClips(ids, (c) => {
    c.filter = filterId;
  });
}

export function applyTransition(kind: TransitionKind) {
  const p = S().project;
  if (!p) return;
  const targets = selectedClips(p).filter((x) => x.clip.kind !== 'audio');
  if (!targets.length) {
    S().notify('Select the clip the transition should lead into');
    return;
  }
  const ok = targets.filter(({ clip, track }) =>
    track.clips.some((c) => c.id !== clip.id && Math.abs(T.clipEnd(c) - clip.start) < 0.002),
  );
  if (kind !== 'none' && !ok.length) {
    S().notify('A transition needs a clip directly before this one on the same track');
    return;
  }
  editClips(
    (kind === 'none' ? targets : ok).map((x) => x.clip.id),
    (c) => {
      c.transition.kind = kind;
      c.transition.duration = Math.min(c.transition.duration || 0.5, c.duration);
    },
  );
}

export function setCanvas(width: number, height: number) {
  S().commit((p) => {
    p.width = even(width);
    p.height = even(height);
  });
}

export function addTrack(kind: TrackKind) {
  S().commit((p) => {
    addTrackTo(p, kind);
  });
}

export function toggleTrack(trackId: string, key: 'muted' | 'hidden' | 'locked') {
  S().commit((p) => {
    const tr = p.tracks.find((t) => t.id === trackId);
    if (tr) tr[key] = !tr[key];
  });
}

export function stepFrames(n: number) {
  const p = S().project;
  if (!p) return;
  player.pause();
  player.seek(T.snapFrame(S().time, p.fps) + n / p.fps);
}

// ---------- groups ----------

/** Turn the selected clips into one compound clip. */
export function groupSelected() {
  const p0 = S().project;
  if (!p0) return;
  const ids = new Set(S().selection);
  // dry run first, so a refusal does not add an empty undo step
  const dry = groupClips(structuredClone(p0), ids);
  if ('error' in dry) {
    S().notify(dry.error, 'error');
    return;
  }
  let id = '';
  S().commit((p) => {
    const r = groupClips(p, ids);
    if ('id' in r) id = r.id;
  });
  if (id) S().select([id]);
  S().notify(ids.size > 1 ? `Grouped ${ids.size} clips into one` : 'Made a group');
}

/** Put a selected group's clips back on the timeline. */
export function ungroupSelected() {
  const p0 = S().project;
  if (!p0) return;
  const target = selectedClips(p0).find((x) => x.clip.kind === 'compound');
  if (!target) {
    S().notify('Select a group to break apart');
    return;
  }
  const dry = ungroupClip(structuredClone(p0), target.clip.id);
  if ('error' in dry) {
    S().notify(dry.error, 'error');
    return;
  }
  let ids: string[] = [];
  S().commit((p) => {
    const r = ungroupClip(p, target.clip.id);
    if ('ids' in r) ids = r.ids;
  });
  S().select(ids);
}

// ---------- the extras ----------

export async function removeSilences() {
  const p0 = S().project;
  if (!p0) return;
  const sel = selectedClips(p0);
  const target = sel.length === 1 ? sel[0] : null;
  const asset = target ? p0.assets.find((a) => a.id === target.clip.assetId) : null;
  if (!target || !asset || !asset.hasAudio || target.track.locked) {
    S().notify('Select one clip that has sound');
    return;
  }
  if (target.clip.reversed || (target.clip.ramp && target.clip.ramp !== 'none')) {
    S().notify('Remove silences first, then reverse or ramp the pieces', 'error');
    return;
  }
  useStore.setState({ busy: 'Listening for silences' });
  const peaks = await ensurePeaks(asset.id);
  useStore.setState({ busy: null });
  if (!peaks) {
    S().notify('Could not read the sound in that file', 'error');
    return;
  }
  const ranges = T.detectKeepRanges(peaks, PEAK_RATE);
  const pieces = T.cutToRanges(target.clip, ranges, p0.fps);
  if (pieces.length === 1 && pieces[0] === target.clip) {
    S().notify('No silences long enough to cut');
    return;
  }
  const saved = target.clip.duration - pieces.reduce((s, c) => s + c.duration, 0);
  S().commit((p) => {
    const f = T.findClip(p, target.clip.id);
    if (f) T.replaceWithRipple(f.track, target.clip.id, pieces);
  });
  S().select(pieces.map((c) => c.id));
  S().notify(`Cut the quiet parts: ${pieces.length} pieces, ${saved.toFixed(1)}s shorter`);
}

export function detachAudio() {
  const p0 = S().project;
  if (!p0) return;
  const targets = selectedClips(p0).filter(({ clip }) => {
    const a = p0.assets.find((x) => x.id === clip.assetId);
    return clip.kind === 'video' && a?.hasAudio && !clip.muted;
  });
  if (!targets.length) {
    S().notify('Select a video clip that has sound');
    return;
  }
  const ids = new Set(targets.map((x) => x.clip.id));
  S().commit((p) => {
    for (const tr of [...p.tracks]) {
      for (const c of tr.clips) {
        if (!ids.has(c.id)) continue;
        const audio = T.newClip({
          kind: 'audio',
          assetId: c.assetId,
          name: c.name,
          start: c.start,
          duration: c.duration,
          offset: c.offset,
          speed: c.speed,
          volume: c.volume,
          fadeIn: c.fadeIn,
          fadeOut: c.fadeOut,
          reversed: c.reversed,
          ramp: c.ramp,
        });
        c.muted = true;
        let track = audioTracks(p).find((t) => !t.locked && !T.overlaps(t, audio.start, audio.duration));
        track ??= addTrackTo(p, 'audio');
        track.clips.push(audio);
        T.sortClips(track);
      }
    }
  });
}

export async function freezeFrame() {
  const p0 = S().project;
  if (!p0) return;
  const t = T.snapFrame(S().time, p0.fps);
  const target = selectedClips(p0).find((x) => x.clip.kind === 'video' && isActive(x.clip, t) && !x.track.locked);
  if (!target || !T.splitClip(target.clip, t, p0.fps)) {
    S().notify('Select a video clip and put the playhead inside it');
    return;
  }
  const src = p0.assets.find((a) => a.id === target.clip.assetId);
  useStore.setState({ busy: 'Capturing frame' });
  try {
    const blob = await grabFrame(target.clip.assetId!, sourceTime(target.clip, t, src?.duration));
    const asset = await importFile(blob, `${target.clip.name} (freeze).png`, 'image');
    const hold = 2;
    let stillId = '';
    S().commit((p) => {
      p.assets.push(asset);
      const f = T.findClip(p, target.clip.id);
      if (!f) return;
      const pair = T.splitClip(f.clip, t, p.fps);
      if (!pair) return;
      const [a, b] = pair;
      const still: Clip = {
        ...structuredClone(f.clip),
        id: T.uid(),
        kind: 'image',
        assetId: asset.id,
        name: 'Freeze frame',
        start: t,
        duration: hold,
        offset: 0,
        speed: 1,
        reversed: false,
        ramp: 'none',
        stab: undefined,
        keys: undefined,
        muted: true,
        fadeIn: 0,
        fadeOut: 0,
        animIn: { kind: 'none', duration: 0.5 },
        animOut: { kind: 'none', duration: 0.5 },
        transition: { kind: 'none', duration: 0.5 },
      };
      stillId = still.id;
      for (const c of f.track.clips) if (c.id !== f.clip.id && c.start >= t - T.EPS) c.start += hold;
      b.start += hold;
      f.track.clips = [...f.track.clips.filter((c) => c.id !== f.clip.id), a, still, b];
      T.sortClips(f.track);
    });
    if (stillId) S().select([stillId]);
  } catch (e) {
    S().notify((e as Error).message, 'error');
  } finally {
    useStore.setState({ busy: null });
  }
}

export async function saveStill() {
  const p = S().project;
  if (!p) return;
  player.pause();
  try {
    const blob = await exportStill(p, S().time);
    downloadBlob(blob, `${p.name || 'frame'} ${T.formatTime(S().time, p.fps).replace(/:/g, '-')}.png`);
  } catch (e) {
    S().notify((e as Error).message, 'error');
  }
}

// ---------- markers ----------

/** Add a marker at the playhead, or remove the one already there. */
export function toggleMarker() {
  const p0 = S().project;
  if (!p0) return;
  const t = T.snapFrame(S().time, p0.fps);
  const half = 0.5 / p0.fps;
  S().commit((p) => {
    const list = p.markers ?? [];
    const at = list.findIndex((m) => Math.abs(m.time - t) <= half);
    if (at >= 0) list.splice(at, 1);
    else list.push({ id: T.uid(), time: t });
    list.sort((a, b) => a.time - b.time);
    p.markers = list;
  });
}

export function removeMarker(id: string) {
  S().commit((p) => {
    p.markers = (p.markers ?? []).filter((m) => m.id !== id);
  });
}

/** Move the playhead to the next (1) or previous (-1) marker. */
export function jumpMarker(dir: 1 | -1) {
  const p = S().project;
  if (!p) return;
  const t = S().time;
  const times = (p.markers ?? []).map((m) => m.time);
  const target = dir > 0 ? times.find((m) => m > t + T.EPS) : [...times].reverse().find((m) => m < t - T.EPS);
  if (target === undefined) return;
  player.pause();
  player.seek(target);
}

// ---------- subtitles ----------

/** Turn a subtitle file into caption clips on a new layer above everything else. */
export async function importSubtitles(file: File) {
  const p0 = S().project;
  if (!p0) return;
  let cues: Cue[];
  try {
    cues = parseSubtitles(await file.text());
  } catch {
    cues = [];
  }
  if (!cues.length) {
    S().notify('No captions were found in that file. It needs to be an .srt or .vtt subtitle file.', 'error');
    return;
  }
  S().commit((p) => {
    const track = addTrackTo(p, 'visual');
    const frame = 1 / p.fps;
    let last = 0;
    for (const cue of cues) {
      // one caption at a time: a cue that starts early waits for the one before it
      const start = Math.max(last, T.snapFrame(cue.start, p.fps));
      const end = T.snapFrame(cue.end, p.fps);
      if (end - start < frame) continue;
      track.clips.push(
        T.newClip({
          kind: 'text',
          name: 'Caption',
          start,
          duration: end - start,
          y: 0.36,
          text: { ...DEFAULT_TEXT, content: cue.text, size: 5, backgroundOn: true, background: '#000000', shadow: false },
        }),
      );
      last = end;
    }
  });
  S().notify(`Added ${cues.length} caption${cues.length > 1 ? 's' : ''} on a new layer`);
}

// ---------- keyframes ----------

/** Change a property that may be keyframed: writes the key under the playhead when it is. */
export function setClipProp(clipId: string, prop: KeyProp, value: number, history = false) {
  const time = S().time;
  editClips([clipId], (c, p) => setProp(c, prop, value, T.clamp(time - c.start, 0, c.duration), p.fps), history);
}

/** Add or remove a keyframe for one property at the playhead. */
export function toggleKeyframe(clipId: string, prop: KeyProp) {
  const time = S().time;
  editClips([clipId], (c, p) => toggleKey(c, prop, T.snapFrame(T.clamp(time - c.start, 0, c.duration), p.fps), p.fps));
}

// ---------- stabilise ----------

function mediaEvent(el: HTMLMediaElement, event: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      el.removeEventListener(event, done);
      el.removeEventListener('error', done);
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    el.addEventListener(event, done);
    el.addEventListener('error', done);
  });
}

const STAB_RATE = 15;
const STAB_MAX_SECONDS = 120;

/** Measure the shake in the selected video clip and store the corrections on it. */
export async function stabiliseSelected() {
  const p = S().project;
  if (!p || S().selection.length !== 1) return;
  const found = T.findClip(p, S().selection[0]);
  const clip = found?.clip;
  const url = clip?.assetId ? mediaUrl(clip.assetId) : undefined;
  if (!clip || clip.kind !== 'video' || !url) {
    S().notify('Select one video clip to steady', 'error');
    return;
  }
  const span = clip.duration * clip.speed;
  if (span > STAB_MAX_SECONDS) {
    S().notify(`That clip uses ${Math.round(span)} seconds of footage. Split it into pieces under ${STAB_MAX_SECONDS} seconds and steady those.`, 'error');
    return;
  }
  player.pause();
  const count = Math.max(2, Math.floor(span * STAB_RATE) + 1);
  const v = document.createElement('video');
  v.muted = true;
  v.preload = 'auto';
  v.src = url;
  const canvas = document.createElement('canvas');
  canvas.width = STAB_W;
  canvas.height = STAB_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const stepsX: number[] = [];
  const stepsY: number[] = [];
  try {
    useStore.setState({ busy: 'Measuring camera shake: 0%' });
    if (v.readyState < 2) await mediaEvent(v, 'loadeddata', 15000);
    if (!v.videoWidth) throw new Error('unreadable');
    let prev: Uint8Array | null = null;
    for (let i = 0; i < count; i++) {
      const seeked = mediaEvent(v, 'seeked', 8000);
      v.currentTime = clip.offset + i / STAB_RATE;
      await seeked;
      ctx.drawImage(v, 0, 0, STAB_W, STAB_H);
      const grey = toGrey(ctx.getImageData(0, 0, STAB_W, STAB_H).data);
      if (prev) {
        const s = estimateShift(prev, grey);
        stepsX.push(s.dx);
        stepsY.push(s.dy);
      }
      prev = grey;
      if (i % 5 === 0) useStore.setState({ busy: `Measuring camera shake: ${Math.round((i / count) * 100)}%` });
    }
  } catch {
    useStore.setState({ busy: null });
    S().notify('That clip could not be read for steadying', 'error');
    return;
  } finally {
    v.removeAttribute('src');
    v.load();
  }
  useStore.setState({ busy: null });

  const radius = Math.round(STAB_RATE * 0.6);
  const dx = corrections(stepsX, radius).map((c) => c / STAB_W);
  const dy = corrections(stepsY, radius).map((c) => c / STAB_H);
  const worst = Math.max(0, ...dx.map(Math.abs), ...dy.map(Math.abs));
  if (worst < 0.004) {
    S().notify('That clip is already steady, so nothing was changed');
    return;
  }
  const zoom = T.clamp(1 / (1 - 2 * worst), 1.02, 1.3);
  const round = (n: number) => Math.round(n * 1e5) / 1e5;
  editClips([clip.id], (c) => {
    c.stab = { rate: STAB_RATE, t0: clip.offset, dx: dx.map(round), dy: dy.map(round), zoom: round(zoom) };
  });
  S().notify(`Steadied. The picture is zoomed in ${Math.round((zoom - 1) * 100)}% to hide the edges.`);
}
