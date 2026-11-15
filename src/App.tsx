import { useEffect } from 'react';
import { useStore } from './store';
import { Home } from './components/Home';
import { Editor } from './components/Editor';
import { onMediaChange } from './lib/media';
import { player } from './engine/player';
import * as A from './actions';
import { projectDuration } from './lib/timeline';

function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) return el.type !== 'range' && el.type !== 'checkbox' && el.type !== 'color';
  return false;
}

export function App() {
  const view = useStore((s) => s.view);
  const toast = useStore((s) => s.toast);
  const busy = useStore((s) => s.busy);

  useEffect(
    () =>
      onMediaChange(() => {
        useStore.setState((s) => ({ mediaVersion: s.mediaVersion + 1 }));
      }),
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      if (s.view !== 'editor' || !s.project || s.dialog) return;
      if (isTyping(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const onSlider = e.target instanceof HTMLInputElement && e.target.type === 'range';
      let handled = true;

      if (mod) {
        if (k === 'z' && e.shiftKey) s.redo();
        else if (k === 'z') s.undo();
        else if (k === 'y') s.redo();
        else if (k === 'd') A.duplicateSelected();
        else if (k === 'g' && e.shiftKey) A.ungroupSelected();
        else if (k === 'g') A.groupSelected();
        else if (k === 'c') A.copySelected();
        else if (k === 'v') A.paste();
        else if (k === 'e') useStore.setState({ dialog: 'export' });
        else if (k === 'a') s.select(s.project.tracks.flatMap((t) => t.clips.map((c) => c.id)));
        else handled = false;
      } else if (k === ' ') player.toggle();
      else if (k === 'k') player.pause();
      else if (k === 'l') player.play();
      else if (k === 'j') {
        player.pause();
        player.seek(s.time - 2);
      } else if (k === 's') A.splitAtPlayhead();
      else if (k === 'q') A.trimToPlayhead('start');
      else if (k === 'w') A.trimToPlayhead('end');
      else if (k === 'Delete' || k === 'Backspace') A.deleteSelected(e.shiftKey);
      else if (k === 'ArrowLeft' && !onSlider) A.stepFrames(e.shiftKey ? -s.project.fps : -1);
      else if (k === 'ArrowRight' && !onSlider) A.stepFrames(e.shiftKey ? s.project.fps : 1);
      else if (k === 'Home') player.seek(0);
      else if (k === 'End') player.seek(projectDuration(s.project));
      else if (k === 'm' && e.shiftKey) A.toggleMarker();
      else if (k === '[') A.jumpMarker(-1);
      else if (k === ']') A.jumpMarker(1);
      else if (k === 'm') {
        A.editClips(s.selection, (c) => {
          c.muted = !c.muted;
        });
      } else if (k === 'n') useStore.setState({ snapping: !s.snapping });
      else if (k === '=' || k === '+') useStore.setState({ zoom: Math.min(600, s.zoom * 1.25) });
      else if (k === '-') useStore.setState({ zoom: Math.max(4, s.zoom / 1.25) });
      else if (k === '?') useStore.setState({ dialog: 'shortcuts' });
      else if (k === 'F1') useStore.setState({ dialog: 'guide' });
      else if (k === 'Escape') s.select([]);
      else handled = false;

      if (handled) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      {view === 'home' ? <Home /> : <Editor />}
      {busy && (
        <div className="busy" role="status">
          <span className="spinner" />
          {busy}
        </div>
      )}
      {toast && (
        <div className={`toast ${toast.kind}`} role="status" key={toast.id}>
          {toast.msg}
        </div>
      )}
    </>
  );
}
