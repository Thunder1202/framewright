import { create } from 'zustand';
import { Clip, Project } from './types';
import { saveProject } from './lib/db';

export type LeftTab = 'media' | 'audio' | 'text' | 'filters' | 'transitions';
export type Dialog = null | 'export' | 'shortcuts' | 'guide';

interface Toast {
  id: number;
  msg: string;
  kind: 'info' | 'error';
}

interface State {
  view: 'home' | 'editor';
  project: Project | null;
  selection: string[];
  time: number;
  playing: boolean;
  /** pixels per second on the timeline */
  zoom: number;
  snapping: boolean;
  past: Project[];
  future: Project[];
  toast: Toast | null;
  dialog: Dialog;
  leftTab: LeftTab;
  clipboard: Clip[];
  /** bumped when thumbnails, images or waveforms finish loading */
  mediaVersion: number;
  busy: string | null;

  /** remember the current state so the next change can be undone */
  checkpoint(): void;
  /** change the project without adding an undo step (use during drags, after a checkpoint) */
  mutate(fn: (p: Project) => void): void;
  /** checkpoint + mutate */
  commit(fn: (p: Project) => void): void;
  undo(): void;
  redo(): void;
  select(ids: string[]): void;
  notify(msg: string, kind?: 'info' | 'error'): void;
}

const HISTORY = 100;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let toastId = 0;

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const p = useStore.getState().project;
    if (p) void saveProject(p).catch(() => useStore.getState().notify('Could not save: storage is full or blocked', 'error'));
  }, 400);
}

export function flushSave(): Promise<void> {
  clearTimeout(saveTimer);
  const p = useStore.getState().project;
  return p ? saveProject(p) : Promise.resolve();
}

export const useStore = create<State>((set, get) => ({
  view: 'home',
  project: null,
  selection: [],
  time: 0,
  playing: false,
  zoom: 80,
  snapping: true,
  past: [],
  future: [],
  toast: null,
  dialog: null,
  leftTab: 'media',
  clipboard: [],
  mediaVersion: 0,
  busy: null,

  checkpoint() {
    const { project, past } = get();
    if (!project) return;
    set({ past: [...past.slice(-HISTORY + 1), project], future: [] });
  },

  mutate(fn) {
    const { project } = get();
    if (!project) return;
    const next = structuredClone(project);
    fn(next);
    next.updatedAt = Date.now();
    const ids = new Set(next.tracks.flatMap((t) => t.clips.map((c) => c.id)));
    set({ project: next, selection: get().selection.filter((id) => ids.has(id)) });
    scheduleSave();
  },

  commit(fn) {
    get().checkpoint();
    get().mutate(fn);
  },

  undo() {
    const { past, future, project } = get();
    if (!project || !past.length) return;
    const prev = past[past.length - 1];
    // assets are never removed by undo: the media stays imported
    const restored = { ...prev, assets: mergeAssets(prev, project) };
    set({ project: restored, past: past.slice(0, -1), future: [project, ...future], selection: [] });
    scheduleSave();
  },

  redo() {
    const { past, future, project } = get();
    if (!project || !future.length) return;
    const next = future[0];
    const restored = { ...next, assets: mergeAssets(next, project) };
    set({ project: restored, past: [...past, project], future: future.slice(1), selection: [] });
    scheduleSave();
  },

  select(ids) {
    set({ selection: ids });
  },

  notify(msg, kind = 'info') {
    clearTimeout(toastTimer);
    const id = ++toastId;
    set({ toast: { id, msg, kind } });
    toastTimer = setTimeout(() => {
      if (get().toast?.id === id) set({ toast: null });
    }, kind === 'error' ? 6000 : 3500);
  },
}));

function mergeAssets(target: Project, current: Project) {
  const have = new Set(target.assets.map((a) => a.id));
  return [...target.assets, ...current.assets.filter((a) => !have.has(a.id))];
}
