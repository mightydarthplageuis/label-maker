const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object.
contextBridge.exposeInMainWorld('electron', {
  downloadPdf: (url) => ipcRenderer.invoke('download-pdf', url),
  cropAndSavePdf: (pdfData, cropRect) => ipcRenderer.invoke('crop-and-save-pdf', pdfData, cropRect),
  printPdf: (data) => ipcRenderer.invoke('print-pdf', data),
  openPdfFile: () => ipcRenderer.invoke('open-pdf-file'),
  getVersion: () => ipcRenderer.invoke('get-version'),
});
