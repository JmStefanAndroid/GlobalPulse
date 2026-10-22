const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pulse', {
    state: () => ipcRenderer.invoke('state'),
    refresh: () => ipcRenderer.invoke('refresh'),
    saveBoards: boards => ipcRenderer.invoke('boards', boards),
    confirmDelete: name => ipcRenderer.invoke('confirm-delete', name),
    settings: settings => ipcRenderer.invoke('settings', settings),
    read: id => ipcRenderer.invoke('read', id),
    openLink: url => ipcRenderer.invoke('open-link', url),
    openMain: () => ipcRenderer.invoke('open-main'),
    onUpdate: callback => { const listener = (_, state) => callback(state); ipcRenderer.on('update', listener); return () => ipcRenderer.removeListener('update', listener); }
});