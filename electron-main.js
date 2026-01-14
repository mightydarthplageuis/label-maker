const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { PDFDocument, rgb } = require('pdf-lib');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

// Configure auto-updater - don't auto download, let user confirm first
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

let mainWindow = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, 'frontend/dist/index.html'));
  }

  return win;
}

app.whenReady().then(() => {
  const userDataPath = app.getPath('userData');
  const labelDir = path.join(userDataPath, 'label');
  if (fs.existsSync(labelDir)) {
    const files = fs.readdirSync(labelDir);
    const now = new Date().getTime();
    const oneDay = 24 * 60 * 60 * 1000;

    files.forEach(file => {
      const filePath = path.join(labelDir, file);
      const stats = fs.statSync(filePath);
      const fileAge = now - stats.mtime.getTime();

      if (file.endsWith('.pdf') && fileAge > oneDay) {
        console.log(`Deleting old label: ${file}`);
        fs.unlinkSync(filePath);
      }
    });
  }

  mainWindow = createWindow();

  // Check for updates (only in production)
  if (process.env.NODE_ENV !== 'development') {
    autoUpdater.checkForUpdates();
  }

  // Auto-updater events
  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `A new version (${info.version}) is available. Do you want to download and install it now?`,
      buttons: ['Yes, Update Now', 'Later'],
    }).then((result) => {
      if (result.response === 0) {
        // User clicked "Yes, Update Now" - start download
        autoUpdater.downloadUpdate();
      }
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    console.log(`Download progress: ${Math.round(progress.percent)}%`);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info.version);
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: 'Update downloaded. The app will now restart to install it.',
      buttons: ['OK'],
    }).then(() => {
      autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.on('error', (error) => {
    console.error('Auto-updater error:', error);
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Update Error',
      message: 'Failed to download update: ' + error.message,
    });
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// --- IPC Handlers ---

// Get app version
ipcMain.handle('get-version', () => {
  return app.getVersion();
});

// Open file dialog and read PDF
ipcMain.handle('open-pdf-file', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: 'Select PDF File',
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
      properties: ['openFile'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const filePath = result.filePaths[0];
    const fileData = fs.readFileSync(filePath);
    const uint8Array = new Uint8Array(fileData);
    
    console.log(`PDF file loaded: ${filePath}, Size: ${uint8Array.byteLength} bytes.`);
    return uint8Array;
  } catch (error) {
    console.error('File open error:', error.message);
    return { error: error.message };
  }
});

// Handle PDF download from URL
ipcMain.handle('download-pdf', async (event, url) => {
  console.log(`Downloading PDF from: ${url}`);
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/pdf')) {
      console.warn(`Invalid content type: ${contentType}`);
      throw new Error('The downloaded file is not a PDF.');
    }

    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    console.log(`PDF download successful. Size: ${uint8Array.byteLength} bytes.`);
    return uint8Array;
  } catch (error) {
    console.error('Download error:', error.message);
    return { error: error.message };
  }
});

ipcMain.handle('crop-and-save-pdf', async (event, pdfData, cropRect) => {
  console.log('Received crop request with rect:', cropRect);
  try {
    const pdfDoc = await PDFDocument.load(pdfData);
    const page = pdfDoc.getPages()[0];

    const { width, height } = page.getSize();
    const x = cropRect.x;
    const y = height - cropRect.y - cropRect.height;
    const newWidth = cropRect.width;
    const newHeight = cropRect.height;

    console.log(`Original page size: ${width}x${height}`);
    console.log(`Applying crop box: x=${x}, y=${y}, width=${newWidth}, height=${newHeight}`);

    page.setCropBox(x, y, newWidth, newHeight);
    page.setMediaBox(x, y, newWidth, newHeight);

    const pdfBytes = await pdfDoc.save();

    const userDataPath = app.getPath('userData');
    const labelDir = path.join(userDataPath, 'label');

    if (!fs.existsSync(labelDir)) {
      fs.mkdirSync(labelDir, { recursive: true });
    }
    const timestamp = new Date().getTime();
    const filePath = path.join(labelDir, `cropped-label-${timestamp}.pdf`);

    fs.writeFileSync(filePath, pdfBytes);
    console.log(`Cropped PDF saved to: ${filePath}`);
    return { success: true, path: filePath, data: pdfBytes };
  } catch (error) {
    console.error('Cropping error:', error.message);
    return { error: error.message };
  }
});

ipcMain.handle('print-pdf', async (event, pdfData) => {
  try {
    const pdfBase64 = Buffer.from(pdfData).toString('base64');
    const dataUrl = `data:application/pdf;base64,${pdfBase64}`;

    const printWindow = new BrowserWindow({ show: false });

    await printWindow.loadURL(dataUrl);

    setTimeout(() => {
      printWindow.webContents.print({}, (success, failureReason) => {
        if (!success) {
          console.error('Printing failed:', failureReason);
        } else {
          console.log('Print dialog opened successfully.');
        }
        printWindow.close();
      });
    }, 1000);

    return { success: true };
  } catch (error) {
    console.error('Printing error:', error.message);
    return { error: error.message };
  }
});
