import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { closeProject, importFiles } from '../actions';
import { Icon, IconButton } from './ui';
import { LeftPanel } from './LeftPanel';
import { Preview } from './Preview';
import { Inspector } from './Inspector';
import { Timeline } from './Timeline';
import { ExportDialog, GuideDialog, ShortcutsDialog } from './Dialogs';

function TopBar() {
  const name = useStore((s) => s.project?.name ?? '');
  const updatedAt = useStore((s) => s.project?.updatedAt ?? 0);
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);

  const rename = () => {
    const next = draft.trim() || 'Untitled project';
    setDraft(next);
    if (next !== name) useStore.getState().commit((p) => void (p.name = next));
  };

  return (
    <header className="topbar">
      <button className="btn ghost" onClick={() => void closeProject()} title="Back to projects">
        <Icon name="back" /> Projects
      </button>
      <span className="brand-mark" aria-hidden="true" />
      <input
        className="project-title"
        value={draft}
        aria-label="Project name"
        maxLength={80}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={rename}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      <span className="saved" title="Saved in this browser's storage on this computer">
        {updatedAt ? 'Saved on this computer' : ''}
      </span>
      <span className="grow" />
      <button className="btn ghost" onClick={() => useStore.setState({ dialog: 'guide' })} title="How everything works (F1)">
        <Icon name="help" /> Guide
      </button>
      <IconButton icon="keyboard" label="Keyboard shortcuts (?)" onClick={() => useStore.setState({ dialog: 'shortcuts' })} />
      <button className="btn primary" onClick={() => useStore.setState({ dialog: 'export' })} title="Export (Ctrl+E)">
        <Icon name="export" /> Export
      </button>
    </header>
  );
}

export function Editor() {
  const dialog = useStore((s) => s.dialog);
  const [tlHeight, setTlHeight] = useState(300);
  const [dropping, setDropping] = useState(false);
  const depth = useRef(0);

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const y0 = e.clientY;
    const h0 = tlHeight;
    const move = (ev: PointerEvent) => {
      setTlHeight(Math.min(window.innerHeight - 260, Math.max(160, h0 - (ev.clientY - y0))));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('Files');

  return (
    <div
      className="editor"
      style={{ gridTemplateRows: `var(--topbar) minmax(0, 1fr) 6px ${tlHeight}px` }}
      onDragEnter={(e) => {
        if (!hasFiles(e)) return;
        depth.current++;
        setDropping(true);
      }}
      onDragLeave={(e) => {
        if (!hasFiles(e)) return;
        if (--depth.current <= 0) setDropping(false);
      }}
      onDragOver={(e) => {
        if (hasFiles(e)) e.preventDefault();
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current = 0;
        setDropping(false);
        void importFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <TopBar />
      <div className="workspace">
        <LeftPanel />
        <Preview />
        <Inspector />
      </div>
      <div className="splitter-h" onPointerDown={startResize} role="separator" aria-orientation="horizontal" aria-label="Resize timeline" />
      <Timeline />
      {dropping && <div className="dropveil">Drop files to import them</div>}
      {dialog === 'export' && <ExportDialog />}
      {dialog === 'shortcuts' && <ShortcutsDialog />}
      {dialog === 'guide' && <GuideDialog />}
    </div>
  );
}
