import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { exportAudio, exportSupported, exportVideo, ExportProgress } from '../engine/export';
import { player } from '../engine/player';
import { downloadBlob } from '../lib/media';
import { projectDuration } from '../lib/timeline';
import { Modal } from './ui';

const close = () => useStore.setState({ dialog: null });

const QUALITIES = [
  { id: 'standard', name: 'Standard (smaller file)', bpp: 0.06 },
  { id: 'high', name: 'High', bpp: 0.1 },
  { id: 'max', name: 'Maximum', bpp: 0.18 },
];

function mb(bytes: number): string {
  return bytes > 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export function ExportDialog() {
  const project = useStore((s) => s.project)!;
  const duration = projectDuration(project);
  const short = Math.min(project.width, project.height);
  const sizes = useMemo(() => {
    const targets = [480, 720, 1080, 1440, 2160];
    const list = targets.map((s) => {
      const k = s / short;
      return { label: `${s}p`, w: Math.round((project.width * k) / 2) * 2, h: Math.round((project.height * k) / 2) * 2 };
    });
    return list.filter((x) => Math.max(x.w, x.h) <= 4096);
  }, [project.width, project.height, short]);
  const nearest = sizes.reduce((best, s, i) => (Math.abs(Math.min(s.w, s.h) - short) < Math.abs(Math.min(sizes[best].w, sizes[best].h) - short) ? i : best), 0);

  const [name, setName] = useState(project.name);
  const [sizeIdx, setSizeIdx] = useState(nearest);
  const [fps, setFps] = useState(project.fps);
  const [quality, setQuality] = useState('high');
  const [format, setFormat] = useState<'video' | 'audio'>(exportSupported() ? 'video' : 'audio');
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'failed'>('idle');
  const [progress, setProgress] = useState<ExportProgress>({ stage: 'audio', ratio: 0 });
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<Blob | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const size = sizes[sizeIdx] ?? sizes[0];
  const bpp = QUALITIES.find((q) => q.id === quality)!.bpp;
  const estimate = ((size.w * size.h * fps * bpp + 192000) / 8) * duration;
  const audioOnly = format === 'audio';
  const filename = `${(name.trim() || 'video').replace(/[\\/:*?"<>|]/g, ' ')}.${audioOnly ? 'wav' : 'mp4'}`;
  const supported = exportSupported();

  const run = async () => {
    player.pause();
    const ctl = new AbortController();
    abort.current = ctl;
    setState('running');
    setMessage('');
    const t0 = performance.now();
    try {
      const res = audioOnly
        ? { blob: await exportAudio(project, setProgress), warning: undefined }
        : await exportVideo(project, { width: size.w, height: size.h, fps, quality: bpp }, setProgress, ctl.signal);
      if (ctl.signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
      setElapsed((performance.now() - t0) / 1000);
      setResult(res.blob);
      setMessage(res.warning ?? '');
      setState('done');
      downloadBlob(res.blob, filename);
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        setState('idle');
        return;
      }
      setMessage((e as Error).message || 'The export failed.');
      setState('failed');
    }
  };

  const overall =
    progress.stage === 'audio' ? progress.ratio * 0.05 : progress.stage === 'video' ? 0.05 + progress.ratio * 0.9 : 0.95 + progress.ratio * 0.05;
  const stageName = progress.stage === 'audio' ? 'Mixing sound' : progress.stage === 'video' ? 'Rendering frames' : 'Writing the file';

  return (
    <Modal title="Export" onClose={close} locked={state === 'running'}>
      {duration <= 0 ? (
        <div className="modal-body">
          <p>The timeline is empty. Add a clip first.</p>
        </div>
      ) : state === 'idle' || state === 'failed' ? (
        <>
          <div className="modal-body">
            <label className="row">
              <span>File name</span>
              <input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="row">
              <span>Save as</span>
              <select className="select" value={format} onChange={(e) => setFormat(e.target.value as 'video' | 'audio')}>
                <option value="video" disabled={!supported}>
                  Video (MP4)
                </option>
                <option value="audio">Sound only (WAV)</option>
              </select>
            </label>
            {!audioOnly && (
              <>
                <label className="row">
                  <span>Size</span>
                  <select className="select" value={sizeIdx} onChange={(e) => setSizeIdx(Number(e.target.value))}>
                    {sizes.map((s, i) => (
                      <option key={s.label} value={i}>
                        {s.label} ({s.w}×{s.h})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="row">
                  <span>Frame rate</span>
                  <select className="select" value={fps} onChange={(e) => setFps(Number(e.target.value))}>
                    {[24, 25, 30, 50, 60].map((f) => (
                      <option key={f} value={f}>
                        {f} fps
                      </option>
                    ))}
                  </select>
                </label>
                <label className="row">
                  <span>Quality</span>
                  <select className="select" value={quality} onChange={(e) => setQuality(e.target.value)}>
                    {QUALITIES.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <p className="hint">
              {audioOnly
                ? `Uncompressed stereo WAV, about ${mb(duration * 48000 * 4)}. Mixed on this computer; nothing is uploaded.`
                : `MP4 (H.264 + AAC), about ${mb(estimate)}. Rendered on this computer; nothing is uploaded and there is no watermark.`}
            </p>
            {!supported && <p className="hint">This browser cannot encode video, so only the sound can be saved here. The desktop app can do both.</p>}
            {state === 'failed' && <p className="error">{message}</p>}
          </div>
          <footer>
            <button className="btn secondary" onClick={close}>
              Cancel
            </button>
            <button className="btn primary" onClick={() => void run()}>
              {state === 'failed' ? 'Try again' : 'Export'}
            </button>
          </footer>
        </>
      ) : state === 'running' ? (
        <>
          <div className="modal-body">
            <p>
              {stageName}… {Math.round(overall * 100)}%
            </p>
            <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(overall * 100)}>
              <span style={{ width: `${overall * 100}%` }} />
            </div>
            <p className="hint">Keep this window open and in front. Rendering slows right down in a hidden tab.</p>
          </div>
          <footer>
            <button className="btn secondary" onClick={() => abort.current?.abort()}>
              Cancel export
            </button>
          </footer>
        </>
      ) : (
        <>
          <div className="modal-body">
            <p className="ok">
              Done: {filename}, {result ? mb(result.size) : ''}, rendered in {elapsed.toFixed(1)}s.
            </p>
            <p className="hint">The file went to your downloads folder (or the place you picked).</p>
            {message && <p className="error">{message}</p>}
          </div>
          <footer>
            <button className="btn secondary" onClick={() => result && downloadBlob(result, filename)}>
              Save again
            </button>
            <button className="btn primary" onClick={close}>
              Close
            </button>
          </footer>
        </>
      )}
    </Modal>
  );
}

import { GUIDE } from '../guide';
import { SHORTCUTS as KEYS } from '../shortcuts';



export function ShortcutsDialog() {
  return (
    <Modal title="Keyboard shortcuts" onClose={close} wide>
      <div className="modal-body">
        <table className="keys">
          <tbody>
            {KEYS.map(([k, what]) => (
              <tr key={k}>
                <th>
                  <kbd>{k}</kbd>
                </th>
                <td>{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

/** Plain-words help for every feature, searchable. The words live in src/guide.ts. */
export function GuideDialog() {
  const [q, setQ] = useState('');
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const sections = GUIDE.map((s) => ({
    name: s.name,
    topics: s.topics.filter((t) => {
      const hay = `${t.title} ${t.what} ${t.where} ${t.words ?? ''} ${t.steps.join(' ')}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    }),
  })).filter((s) => s.topics.length);
  return (
    <Modal title="Guide: how everything works" onClose={close} wide>
      <div className="modal-body helpbook">
        <input
          className="input"
          type="search"
          autoFocus
          placeholder="What do you want to do? Try: slow motion, caption, shaky"
          aria-label="Search the guide"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {!sections.length && <p className="hint">Nothing matches that. Try a simpler word, such as cut, text, speed or sound.</p>}
        {sections.map((s) => (
          <section key={s.name}>
            <h3>{s.name}</h3>
            {s.topics.map((t) => (
              <details key={t.title} open={words.length > 0 && sections.reduce((n, x) => n + x.topics.length, 0) <= 3}>
                <summary>
                  <b>{t.title}</b>
                  <span>{t.what}</span>
                </summary>
                <p className="helpbook-where">Where: {t.where}</p>
                <ol>
                  {t.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                {t.note && <p className="hint">{t.note}</p>}
              </details>
            ))}
          </section>
        ))}
      </div>
    </Modal>
  );
}
