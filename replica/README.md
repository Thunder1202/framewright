# replica/: design notes from building Framewright

These are the planning and record-keeping files written while Framewright was built. None of them is needed to build or run the app (`npm run build`, `npm run dist` and `npm run dev` never read this folder).

| File | What it is | Used by |
| --- | --- | --- |
| `features.csv` | The feature checklist: each feature, whether the reference editor has it (`original`) and whether Framewright does (`clone`: yes / partial / no / skip), with notes | `npm run docs`, which turns it into [docs/FEATURES.md](../docs/FEATURES.md) |
| `recon.md` | A survey of which features a typical desktop video editor (CapCut) offers, written from its public marketing pages and help articles only | Planning only |
| `architecture.md` | Why the stack was chosen (React, WebCodecs, Electron) and the build order | Planning only |
| `design/tokens.json`, `design/components.md` | Framewright's own colours, sizes and component specs; `src/styles.css` mirrors the tokens | Reference for contributors |
| `build-log.md` | Every round of work, with what was checked and what was not | Reference for contributors |

No code, artwork, icons, templates or wording were taken from any other editor; the reference product was only used to decide which features matter.
