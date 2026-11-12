const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  send: (c, ...a) => ipcRenderer.send(c, ...a),
  invoke: (c, ...a) => ipcRenderer.invoke(c, ...a),
  on: (c, f) => ipcRenderer.on(c, (_, ...d) => f(...d))
});
