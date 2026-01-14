const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { PDFDocument, degrees } = require('pdf-lib');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

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
        console.log('Deleting old label:', file);
        fs.unlinkSync(filePath);
      }
    });
  }

  mainWindow = createWindow();

  if (process.env.NODE_ENV !== 'development') {
    autoUpdater.checkForUpdates();
  }

  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: 'A new version (' + info.version + ') is available. Download and install?',
      buttons: ['Yes, Update Now', 'Later'],
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.downloadUpdate();
      }
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: 'Update downloaded. The app will restart to install.',
      buttons: ['OK'],
    }).then(() => {
      autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.on('error', (error) => {
    console.error('Auto-updater error:', error);
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

ipcMain.handle('get-version', () => {
  return app.getVersion();
});

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
    return new Uint8Array(fileData);
  } catch (error) {
    return { error: error.message };
  }
});

ipcMain.handle('download-pdf', async (event, url) => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to download: ' + response.statusText);

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/pdf')) {
      throw new Error('The file is not a PDF.');
    }

    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch (error) {
    return { error: error.message };
  }
});

ipcMain.handle('crop-and-save-pdf', async (event, pdfData, cropRect) => {
  console.log('Crop request:', cropRect);
  try {
    const pdfDoc = await PDFDocument.load(pdfData);
    const page = pdfDoc.getPages()[0];
    const { width, height } = page.getSize();
    const rotation = page.getRotation().angle;

    console.log('Page: ' + width + 'x' + height + ', rotation: ' + rotation);

    let pdfX, pdfY, pdfWidth, pdfHeight;

    // Transform visual coordinates to PDF internal coordinates based on rotation
    // Visual coordinates come from canvas (origin top-left)
    // PDF coordinates use origin bottom-left
    if (rotation === 0) {
      // No rotation - just flip Y axis
      pdfX = cropRect.x;
      pdfY = height - cropRect.y - cropRect.height;
      pdfWidth = cropRect.width;
      pdfHeight = cropRect.height;
    } else if (rotation === 90) {
      // 90° clockwise: visual X -> PDF Y, visual Y -> PDF (width - X)
      pdfX = cropRect.y;
      pdfY = height - cropRect.x - cropRect.width;
      pdfWidth = cropRect.height;
      pdfHeight = cropRect.width;
    } else if (rotation === 180) {
      // 180°: flip both axes
      pdfX = width - cropRect.x - cropRect.width;
      pdfY = cropRect.y;
      pdfWidth = cropRect.width;
      pdfHeight = cropRect.height;
    } else if (rotation === 270) {
      // 270° clockwise: visual Y -> PDF (width - X), visual X -> PDF Y
      // Visual dimensions are swapped: visual width = PDF height, visual height = PDF width
      pdfX = width - cropRect.y - cropRect.height;
      pdfY = cropRect.x;
      pdfWidth = cropRect.height;
      pdfHeight = cropRect.width;
    } else {
      // Fallback
      pdfX = cropRect.x;
      pdfY = height - cropRect.y - cropRect.height;
      pdfWidth = cropRect.width;
      pdfHeight = cropRect.height;
    }

    console.log('Crop coords: x=' + pdfX + ', y=' + pdfY + ', w=' + pdfWidth + ', h=' + pdfHeight);

    page.setCropBox(pdfX, pdfY, pdfWidth, pdfHeight);
    page.setMediaBox(pdfX, pdfY, pdfWidth, pdfHeight);
    page.setRotation(degrees(0));

    const pdfBytes = await pdfDoc.save();

    const userDataPath = app.getPath('userData');
    const labelDir = path.join(userDataPath, 'label');

    if (!fs.existsSync(labelDir)) {
      fs.mkdirSync(labelDir, { recursive: true });
    }
    const filePath = path.join(labelDir, 'cropped-label-' + Date.now() + '.pdf');

    fs.writeFileSync(filePath, pdfBytes);
    console.log('Saved to:', filePath);
    return { success: true, path: filePath, data: pdfBytes };
  } catch (error) {
    console.error('Crop error:', error.message);
    return { error: error.message };
  }
});

ipcMain.handle('print-pdf', async (event, pdfData) => {
  try {
    const pdfBase64 = Buffer.from(pdfData).toString('base64');
    const dataUrl = 'data:application/pdf;base64,' + pdfBase64;

    const printWindow = new BrowserWindow({ show: false });
    await printWindow.loadURL(dataUrl);

    setTimeout(() => {
      printWindow.webContents.print({}, (success, reason) => {
        if (!success) console.error('Print failed:', reason);
        printWindow.close();
      });
    }, 1000);

    return { success: true };
  } catch (error) {
    return { error: error.message };
  }
});
