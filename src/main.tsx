import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);

if (import.meta.env.DEV) {
  // handles for poking at the app from the console while developing
  void Promise.all([import('./actions'), import('./store'), import('./engine/player'), import('./engine/export'), import('./lib/timeline')]).then(
    ([actions, store, player, exporter, timeline]) => {
      Object.assign(window, { __fw: { A: actions, useStore: store.useStore, player: player.player, exporter, T: timeline } });
    },
  );
}
