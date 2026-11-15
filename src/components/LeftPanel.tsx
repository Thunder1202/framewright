import { useRef, useState } from 'react';
import { LeftTab, useStore } from '../store';
import { Asset, TextStyle, TransitionKind } from '../types';
import {
  addAssetToTimeline,
  addText,
  applyFilter,
  applyTransition,
  autoCaptions,
  convertCaptions,
  exportSrt,
  importFiles,
  importSubtitles,
  openKadr,
  removeAsset,
  translateCaptions,
} from '../actions';
import { SpokenLanguage } from '../lib/kadr';
import { FILTERS, swatchCss } from '../lib/filters';
import { encodeWav, importFile } from '../lib/media';
import { player } from '../engine/player';
import { Icon } from './ui';

const TABS: { id: LeftTab; label: string; icon: string }[] = [
  { id: 'media', label: 'Media', icon: 'media' },
  { id: 'audio', label: 'Audio', icon: 'audio' },
  { id: 'text', label: 'Text', icon: 'text' },
  { id: 'filters', label: 'Looks', icon: 'filter' },
  { id: 'transitions', label: 'Transitions', icon: 'transition' },
];

function clock(d: number): string {
  const m = Math.floor(d / 60);
  const s = Math.floor(d % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function ImportButton({ accept, label }: { accept: string; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button className="btn primary block" onClick={() => ref.current?.click()}>
        <Icon name="plus" /> {label}
      </button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          void importFiles(files);
        }}
      />
    </>
  );
}

function AssetTile({ asset }: { asset: Asset }) {
  return (
    <li className="asset">
      <button
        className="asset-main"
        draggable
        title={`${asset.name}\nClick to add at the end, or drag onto a track`}
        onDragStart={(e) => {
          e.dataTransfer.setData('application/x-asset', asset.id);
          e.dataTransfer.effectAllowed = 'copy';
        }}
        onClick={() => addAssetToTimeline(asset.id)}
      >
        <span className={`asset-thumb ${asset.kind}`} style={asset.thumb ? { backgroundImage: `url(${asset.thumb})` } : undefined}>
          {asset.kind === 'audio' && <Icon name="audio" size={22} />}
          {asset.kind !== 'image' && <span className="badge">{clock(asset.duration)}</span>}
          <span className="asset-add" aria-hidden="true">
            <Icon name="plus" size={14} />
          </span>
        </span>
        <span className="asset-name">{asset.name}</span>
      </button>
      <button className="asset-remove" title="Remove from project" aria-label={`Remove ${asset.name}`} onClick={() => removeAsset(asset.id)}>
        <Icon name="close" size={12} />
      </button>
    </li>
  );
}

function MediaTab() {
  const assets = useStore((s) => s.project?.assets ?? []);
  const visual = assets.filter((a) => a.kind !== 'audio');
  return (
    <>
      <ImportButton accept="video/*,image/*,audio/*,.mkv,.mov" label="Import files" />
      {visual.length === 0 ? (
        <p className="empty">Drop videos and pictures anywhere in this window, or use the button above.</p>
      ) : (
        <ul className="asset-grid">
          {visual.map((a) => (
            <AssetTile key={a.id} asset={a} />
          ))}
        </ul>
      )}
    </>
  );
}

function AudioTab() {
  const assets = useStore((s) => s.project?.assets ?? []);
  const audio = assets.filter((a) => a.kind === 'audio');
  const [rec, setRec] = useState<{ stop: () => void } | null>(null);

  const record = async () => {
    if (rec) {
      rec.stop();
      return;
    }
    const S = useStore.getState;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      S().notify('Microphone access was blocked. Allow it for this page to record.', 'error');
      return;
    }
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    const startedAt = S().time;
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      player.pause();
      setRec(null);
      try {
        const raw = new Blob(chunks, { type: recorder.mimeType });
        const ctx = new OfflineAudioContext(2, 1, 48000);
        const buf = await ctx.decodeAudioData(await raw.arrayBuffer());
        const n = (S().project?.assets.filter((a) => a.name.startsWith('Voiceover')).length ?? 0) + 1;
        const asset = await importFile(encodeWav(buf), `Voiceover ${n}.wav`, 'audio');
        S().mutate((p) => p.assets.push(asset));
        addAssetToTimeline(asset.id, { time: startedAt });
      } catch {
        S().notify('The recording could not be saved', 'error');
      }
    };
    recorder.start();
    player.play();
    setRec({ stop: () => recorder.state !== 'inactive' && recorder.stop() });
  };

  return (
    <>
      <ImportButton accept="audio/*" label="Import audio" />
      <button className={`btn block ${rec ? 'danger-solid' : 'secondary'}`} onClick={() => void record()}>
        <Icon name={rec ? 'stop' : 'mic'} /> {rec ? 'Stop recording' : 'Record voiceover'}
      </button>
      {rec && <p className="hint">Recording from the playhead. The timeline plays while you talk.</p>}
      {audio.length === 0 ? (
        <p className="empty">Bring your own music and sounds: MP3, WAV, M4A, OGG or FLAC.</p>
      ) : (
        <ul className="asset-grid">
          {audio.map((a) => (
            <AssetTile key={a.id} asset={a} />
          ))}
        </ul>
      )}
    </>
  );
}

const TEXT_PRESETS: { name: string; sample: string; style: Partial<TextStyle> }[] = [
  { name: 'Title', sample: 'Big title', style: { content: 'Big title', size: 12, bold: true } },
  { name: 'Subtitle', sample: 'A line underneath', style: { content: 'A line underneath', size: 6, bold: false } },
  {
    name: 'Caption bar',
    sample: 'Caption on a bar',
    style: { content: 'Caption on a bar', size: 5, bold: true, backgroundOn: true, background: '#000000', shadow: false },
  },
  {
    name: 'Outline',
    sample: 'OUTLINED',
    style: { content: 'OUTLINED', size: 11, bold: true, font: 'Impact, Haettenschweiler, sans-serif', strokeWidth: 8, stroke: '#000000', shadow: false },
  },
  {
    name: 'Highlight',
    sample: 'Highlight',
    style: { content: 'Highlight', size: 8, bold: true, color: '#1a1205', backgroundOn: true, background: '#f5a524', shadow: false },
  },
  {
    name: 'Serif quote',
    sample: '"Said someone"',
    style: { content: '"Said someone"', size: 7, bold: false, italic: true, font: 'Georgia, Times New Roman, serif' },
  },
  {
    name: 'Typewriter',
    sample: 'typed_note.txt',
    style: { content: 'typed_note.txt', size: 5, bold: false, font: 'Consolas, Courier New, monospace', color: '#d7ffd9' },
  },
];

function TextTab() {
  const ref = useRef<HTMLInputElement>(null);
  const [language, setLanguage] = useState<SpokenLanguage>('auto');
  return (
    <>
      <h4 className="panel-title">Captions from speech</h4>
      <label className="row">
        <span>Spoken</span>
        <select className="select" value={language} onChange={(e) => setLanguage(e.target.value as SpokenLanguage)} aria-label="Language spoken in the video">
          <option value="auto">Auto (mixed)</option>
          <option value="uz">Uzbek</option>
          <option value="ru">Russian</option>
          <option value="en">English</option>
        </select>
      </label>
      <button className="btn primary block" onClick={() => void autoCaptions(language)} title="Listens to the selected video clip and writes its captions, with a time for every word">
        <Icon name="captions" /> Write captions
      </button>
      <p className="hint">Select a video clip first. Up to 5 minutes of video. The first time, a speech model is downloaded.</p>
      <div className="btn-row">
        <button className="btn secondary small" onClick={() => convertCaptions('to_cyrillic')} title="Uzbek: convert the text to Cyrillic">
          Lotin → Кирилл
        </button>
        <button className="btn secondary small" onClick={() => convertCaptions('to_latin')} title="Uzbek: convert the text to Latin">
          Кирилл → Lotin
        </button>
        <button className="btn secondary small" onClick={() => void translateCaptions('en', 'ru')} title="Translate the text from English to Russian, offline">
          EN → RU
        </button>
        <button className="btn secondary small" onClick={() => void translateCaptions('ru', 'en')} title="Translate the text from Russian to English, offline">
          RU → EN
        </button>
      </div>
      <p className="hint">These change the selected text clips, or all text when none is selected.</p>
      <div className="btn-row">
        <button className="btn secondary small" onClick={exportSrt} title="Save every text clip as an .srt subtitle file">
          Save as .srt
        </button>
        <button className="btn secondary small" onClick={() => void openKadr()} title="Open the captions engine's own page: batch captioning and its burned-in caption styles">
          Open Kadr
        </button>
      </div>
      <h4 className="panel-title">Subtitles file and titles</h4>
      <button className="btn secondary block" onClick={() => ref.current?.click()} title="Each line of an .srt or .vtt file becomes a caption at its own time">
        <Icon name="captions" /> Import subtitles
      </button>
      <input
        ref={ref}
        type="file"
        accept=".srt,.vtt,text/vtt,application/x-subrip"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void importSubtitles(file);
        }}
      />
    <ul className="tile-list">
      {TEXT_PRESETS.map((p) => (
        <li key={p.name}>
          <button className="tile text-tile" onClick={() => addText(p.style, p.name)} title={`Add at the playhead: ${p.name}`}>
            <span
              className="text-sample"
              style={{
                fontFamily: p.style.font,
                fontWeight: p.style.bold === false ? 400 : 700,
                fontStyle: p.style.italic ? 'italic' : 'normal',
                color: p.style.color ?? '#fff',
                background: p.style.backgroundOn ? p.style.background : 'transparent',
                WebkitTextStroke: p.style.strokeWidth ? `1px ${p.style.stroke}` : undefined,
              }}
            >
              {p.sample}
            </span>
            <span className="tile-name">{p.name}</span>
          </button>
        </li>
      ))}
    </ul>
    </>
  );
}

function FiltersTab() {
  const thumb = useStore((s) => {
    const p = s.project;
    if (!p) return undefined;
    const sel = p.tracks.flatMap((t) => t.clips).find((c) => c.id === s.selection[0]);
    return p.assets.find((a) => a.id === sel?.assetId)?.thumb ?? p.assets.find((a) => a.thumb)?.thumb;
  });
  const current = useStore((s) => {
    const sel = s.project?.tracks.flatMap((t) => t.clips).find((c) => c.id === s.selection[0]);
    return sel && sel.kind !== 'audio' && sel.kind !== 'text' ? sel.filter : null;
  });
  return (
    <>
      <p className="hint">Select a clip, then pick a look. Fine-tune it under Adjust on the right.</p>
      <ul className="swatch-grid">
        {FILTERS.map((f) => (
          <li key={f.id}>
            <button className={`tile swatch${current === f.id ? ' applied' : ''}`} onClick={() => applyFilter(f.id)}>
              <span
                className="swatch-img"
                style={{ backgroundImage: thumb ? `url(${thumb})` : undefined, filter: swatchCss(f.id) }}
              />
              <span className="tile-name">{f.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

export const TRANSITIONS: { id: TransitionKind; name: string }[] = [
  { id: 'none', name: 'Hard cut' },
  { id: 'crossfade', name: 'Cross dissolve' },
  { id: 'dip-black', name: 'Dip to black' },
  { id: 'slide', name: 'Slide over' },
  { id: 'push', name: 'Push' },
  { id: 'wipe', name: 'Wipe' },
  { id: 'zoom', name: 'Zoom through' },
];

function TransitionsTab() {
  const current = useStore((s) => {
    const sel = s.project?.tracks.flatMap((t) => t.clips).find((c) => c.id === s.selection[0]);
    return sel ? sel.transition.kind : null;
  });
  return (
    <>
      <p className="hint">Select the second of two touching clips, then choose how it arrives.</p>
      <ul className="swatch-grid">
        {TRANSITIONS.map((t) => (
          <li key={t.id}>
            <button className={`tile swatch${current === t.id ? ' applied' : ''}`} onClick={() => applyTransition(t.id)}>
              <span className={`trans-demo ${t.id}`} aria-hidden="true">
                <i />
                <b />
              </span>
              <span className="tile-name">{t.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

export function LeftPanel() {
  const tab = useStore((s) => s.leftTab);
  return (
    <aside className="left">
      <nav className="rail" role="tablist" aria-label="Library">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            aria-label={t.label}
            className={`rail-tab${tab === t.id ? ' active' : ''}`}
            onClick={() => useStore.setState({ leftTab: t.id })}
          >
            <Icon name={t.icon} size={18} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      <div className="panel" role="tabpanel">
        {tab === 'media' && <MediaTab />}
        {tab === 'audio' && <AudioTab />}
        {tab === 'text' && <TextTab />}
        {tab === 'filters' && <FiltersTab />}
        {tab === 'transitions' && <TransitionsTab />}
      </div>
    </aside>
  );
}
