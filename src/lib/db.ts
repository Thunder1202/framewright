import { del, get, set } from 'idb-keyval';
import { Project, ProjectSummary } from '../types';
import { projectDuration } from './timeline';

/** Everything is stored in this browser's IndexedDB. Nothing is sent anywhere. */

export async function listProjects(): Promise<ProjectSummary[]> {
  const list = ((await get('projects')) as ProjectSummary[] | undefined) ?? [];
  return list.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadProject(id: string): Promise<Project | undefined> {
  return (await get(`project:${id}`)) as Project | undefined;
}

export async function saveProject(p: Project): Promise<void> {
  await set(`project:${p.id}`, p);
  const list = ((await get('projects')) as ProjectSummary[] | undefined) ?? [];
  const summary: ProjectSummary = {
    id: p.id,
    name: p.name,
    width: p.width,
    height: p.height,
    updatedAt: p.updatedAt,
    duration: projectDuration(p),
    thumb: p.assets.find((a) => a.thumb)?.thumb,
  };
  const i = list.findIndex((x) => x.id === p.id);
  if (i >= 0) list[i] = summary;
  else list.push(summary);
  await set('projects', list);
}

export async function deleteProject(id: string): Promise<void> {
  const p = await loadProject(id);
  if (p) for (const a of p.assets) await del(`media:${a.id}`);
  await del(`project:${id}`);
  const list = ((await get('projects')) as ProjectSummary[] | undefined) ?? [];
  await set(
    'projects',
    list.filter((x) => x.id !== id),
  );
}

export const saveMedia = (assetId: string, blob: Blob) => set(`media:${assetId}`, blob);
export const loadMediaBlob = (assetId: string) => get(`media:${assetId}`) as Promise<Blob | undefined>;
export const deleteMedia = (assetId: string) => del(`media:${assetId}`);

/** Ask the browser not to evict our storage under disk pressure. */
export async function requestPersistence(): Promise<void> {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch {
    /* best effort */
  }
}
