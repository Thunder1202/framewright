// The only two things the editor may ask the desktop shell to do.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('framewright', {
  /** Start the captions engine if it is not running. Resolves to { ok, url } or { ok: false, error }. */
  startKadr: () => ipcRenderer.invoke('kadr:start'),
  /** Open the engine's own page (word-by-word editor, burned-in caption styles) in the browser. */
  openKadr: () => ipcRenderer.invoke('kadr:open'),
});
