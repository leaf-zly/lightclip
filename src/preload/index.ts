import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type AppState, type HistoryItemUpsert, type LightClipApi, type PasteStatusUpdate } from '../shared/types.js'

const api: LightClipApi = {
  getState: () => ipcRenderer.invoke(IPC_CHANNELS.getState),
  copyItem: (id) => ipcRenderer.invoke(IPC_CHANNELS.copyItem, id),
  deleteItem: (id) => ipcRenderer.invoke(IPC_CHANNELS.deleteItem, id),
  togglePin: (id) => ipcRenderer.invoke(IPC_CHANNELS.togglePin, id),
  clearHistory: () => ipcRenderer.invoke(IPC_CHANNELS.clearHistory),
  clearByKind: (kind) => ipcRenderer.invoke(IPC_CHANNELS.clearByKind, kind),
  exportHistory: () => ipcRenderer.invoke(IPC_CHANNELS.exportHistory),
  importHistory: () => ipcRenderer.invoke(IPC_CHANNELS.importHistory),
  checkForUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.checkForUpdates),
  openExternalUrl: (url) => ipcRenderer.invoke(IPC_CHANNELS.openExternalUrl, url),
  selectStorageDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.selectStorageDirectory),
  resetStorageDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.resetStorageDirectory),
  openStorageDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.openStorageDirectory),
  updateSettings: (settings) => ipcRenderer.invoke(IPC_CHANNELS.updateSettings, settings),
  minimizeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.minimizeWindow),
  toggleMaximizeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.toggleMaximizeWindow),
  closeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.closeWindow),
  hidePanel: () => ipcRenderer.invoke(IPC_CHANNELS.hidePanel),
  quit: () => ipcRenderer.invoke(IPC_CHANNELS.quit),
  onStateChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: AppState) => callback(state)
    ipcRenderer.on(IPC_CHANNELS.stateChanged, listener)
    return () => ipcRenderer.off(IPC_CHANNELS.stateChanged, listener)
  },
  onHistoryItemUpserted: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, update: HistoryItemUpsert) => callback(update)
    ipcRenderer.on(IPC_CHANNELS.historyItemUpserted, listener)
    return () => ipcRenderer.off(IPC_CHANNELS.historyItemUpserted, listener)
  },
  onPasteStatus: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, update: PasteStatusUpdate) => callback(update)
    ipcRenderer.on(IPC_CHANNELS.pasteStatus, listener)
    return () => ipcRenderer.off(IPC_CHANNELS.pasteStatus, listener)
  },
}

contextBridge.exposeInMainWorld('lightClip', api)
