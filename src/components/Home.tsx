import { useEffect, useState } from 'react';
import { ProjectSummary } from '../types';
import { deleteProject, listProjects } from '../lib/db';
import { createProject, openProject } from '../actions';
import { Icon } from './ui';

function ago(ts: number): string {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(ts).toLocaleDateString();
}

function length(d: number): string {
  const m = Math.floor(d / 60);
  const s = Math.round(d % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function Home() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [failed, setFailed] = useState(false);

  const refresh = () =>
    listProjects()
      .then(setProjects)
      .catch(() => setFailed(true));

  useEffect(() => {
    void refresh();
  }, []);

  const remove = async (p: ProjectSummary) => {
    if (!window.confirm(`Delete "${p.name}" and its imported media? This cannot be undone.`)) return;
    await deleteProject(p.id);
    void refresh();
  };

  return (
    <main className="home">
      <header className="home-head">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          Framewright
        </div>
        <p className="home-note">Everything stays on this computer. No account, no watermark, no upload.</p>
      </header>

      <section className="home-body">
        <div className="home-row">
          <div>
            <h1>Projects</h1>
            <p className="home-sub">Pick up where you left off, or start something new.</p>
          </div>
        </div>

        {failed && <p className="empty">Storage is not available in this browser window, so projects cannot be saved. Private windows often block it.</p>}

        {projects && projects.length === 0 && !failed && (
          <div className="empty big">
            <Icon name="film" size={40} />
            <p>No projects yet.</p>
            <button className="btn primary" onClick={() => void createProject()}>
              Start your first edit
            </button>
          </div>
        )}

        {projects && projects.length > 0 && (
          <ul className="project-grid">
            <li className="project-card">
              <button className="project-new" onClick={() => void createProject()}>
                <span className="plus">
                  <Icon name="plus" size={22} />
                </span>
                New project
              </button>
            </li>
            {projects.map((p) => (
              <li key={p.id} className="project-card">
                <button className="project-open" onClick={() => void openProject(p.id)} aria-label={`Open ${p.name}`}>
                  <span className="project-thumb" style={p.thumb ? { backgroundImage: `url(${p.thumb})` } : undefined}>
                    {!p.thumb && <Icon name="film" size={28} />}
                    <span className="badge">{length(p.duration)}</span>
                  </span>
                  <span className="project-name">{p.name}</span>
                  <span className="project-meta">
                    {p.width}×{p.height} · {ago(p.updatedAt)}
                  </span>
                </button>
                <button className="btn icon danger project-del" title="Delete project" aria-label={`Delete ${p.name}`} onClick={() => void remove(p)}>
                  <Icon name="trash" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
