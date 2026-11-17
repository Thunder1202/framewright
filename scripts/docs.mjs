// Writes docs/GUIDE.md and docs/FEATURES.md from the app's own data, so the
// Markdown always says what the app says.   Run:  npm run docs
// (Node 22.6+ reads the .ts files directly.)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { GUIDE } from '../src/guide.ts';
import { SHORTCUTS } from '../src/shortcuts.ts';

const root = new URL('..', import.meta.url);
const out = (name, text) => {
  mkdirSync(new URL('docs/', root), { recursive: true });
  writeFileSync(new URL(`docs/${name}`, root), text.replace(/\n{3,}/g, '\n\n'));
};
const note = (src) => `<!-- Made by \`npm run docs\` from ${src}. Edit that file, not this one. -->\n\n`;
const anchor = (s) => s.toLowerCase().replace(/[^\p{L}\p{N} -]/gu, '').trim().replace(/ /g, '-');
const cell = (s) => String(s).replace(/\|/g, '\\|');

// ---------- GUIDE.md ----------
let g = note('src/guide.ts and src/shortcuts.ts');
g += '# Framewright guide\n\n';
g += 'Everything the editor can do, in plain words. The same text is inside the app: press **F1** or the **Guide** button at the top right, and search it.\n\n';
g += '## Contents\n\n';
for (const s of GUIDE) {
  g += `- **[${s.name}](#${anchor(s.name)})**: ${s.topics.map((t) => `[${t.title}](#${anchor(t.title)})`).join(' · ')}\n`;
}
g += '- **[Keyboard shortcuts](#keyboard-shortcuts)**\n\n';
for (const s of GUIDE) {
  g += `## ${s.name}\n\n`;
  for (const t of s.topics) {
    g += `### ${t.title}\n\n${t.what}\n\n**Where:** ${t.where}\n\n`;
    g += t.steps.map((step, i) => `${i + 1}. ${step}`).join('\n') + '\n\n';
    if (t.note) g += `> ${t.note}\n\n`;
  }
}
g += '## Keyboard shortcuts\n\n| Keys | What it does |\n| --- | --- |\n';
for (const [k, what] of SHORTCUTS) g += `| <kbd>${cell(k)}</kbd> | ${cell(what)} |\n`;
out('GUIDE.md', g);

// ---------- FEATURES.md ----------
const rows = readFileSync(new URL('replica/features.csv', root), 'utf8')
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((l) => {
    const [feature, area, priority, original, clone, ...rest] = l.split(',');
    return { feature, area, priority, original, clone, notes: rest.join(',') };
  });
const STATE = { yes: '✅ Done', partial: '🟡 Partly', no: '❌ Not built', skip: '⛔ Left out on purpose' };
const AREAS = {
  projects: 'Projects', media: 'Media', timeline: 'Timeline', preview: 'Preview', text: 'Text and captions',
  effects: 'Effects', animation: 'Animation', audio: 'Sound', speed: 'Speed', export: 'Export', shell: 'The window',
};
const count = (state) => rows.filter((r) => r.clone === state).length;
let f = note('replica/features.csv');
f += '# What Framewright can do\n\n';
f += `**${count('yes')} done, ${count('partial')} partly done, ${count('skip')} left out on purpose**, out of ${rows.length} features.\n\n`;
f += 'How to use each one is in [GUIDE.md](GUIDE.md). What “partly” means is in the Notes column.\n\n';
const order = [...new Set(rows.map((r) => r.area))];
for (const area of order) {
  const list = rows.filter((r) => r.area === area && r.clone !== 'skip');
  if (!list.length) continue;
  f += `## ${AREAS[area] ?? area}\n\n| Feature | State | Notes |\n| --- | --- | --- |\n`;
  for (const r of list) f += `| ${cell(r.feature)} | ${STATE[r.clone] ?? r.clone} | ${cell(r.notes)} |\n`;
  f += '\n';
}
const skipped = rows.filter((r) => r.clone === 'skip');
if (skipped.length) {
  f += '## Left out on purpose\n\nThese need an online service, a paid catalogue or someone else’s servers, which goes against “everything stays on this computer”.\n\n';
  f += '| Feature | Why |\n| --- | --- |\n';
  for (const r of skipped) f += `| ${cell(r.feature)} | ${cell(r.notes)} |\n`;
}
out('FEATURES.md', f);
console.log('wrote docs/GUIDE.md and docs/FEATURES.md');
