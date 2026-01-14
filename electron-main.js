const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { PDFDocument, rgb } = require('pdf-lib');
const fs = require('fs');

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

  // In development, load from Vite dev server.
  // In production, load the built HTML file.
  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173');
    // Open the DevTools.
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, 'frontend/dist/index.html'));
  }

  // Open the DevTools.
  win.webContents.openDevTools();
}

app.whenReady().then(() => {
  // Clean up old cropped labels
  const userDataPath = app.getPath('userData');
  const labelDir = path.join(userDataPath, 'label');
  if (fs.existsSync(labelDir)) {
    const files = fs.readdirSync(labelDir);
    const now = new Date().getTime();
    const oneDay = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

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
  createWindow();

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

// Handle PDF download
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

// Handle PDF cropping and saving
ipcMain.handle('crop-and-save-pdf', async (event, pdfData, cropRect) => {
  console.log('Received crop request with rect:', cropRect);
  try {
    const pdfDoc = await PDFDocument.load(pdfData);
    const page = pdfDoc.getPages()[0]; // Only process the first page

    // pdf-lib's coordinate system has the origin at the bottom-left corner.
    // The incoming cropRect from the UI has the origin at the top-left.
    // We need to convert the y-coordinate.
    const { width, height } = page.getSize();
    const x = cropRect.x;
    const y = height - cropRect.y - cropRect.height; // Convert y-origin
    const newWidth = cropRect.width;
    const newHeight = cropRect.height;
    
    console.log(`Original page size: ${width}x${height}`);
    console.log(`Applying crop box: x=${x}, y=${y}, width=${newWidth}, height=${newHeight}`);

    page.setCropBox(x, y, newWidth, newHeight);
    
    // Some viewers might ignore CropBox, so we can also set MediaBox.
    // This makes the crop "permanent" for most viewers.
    page.setMediaBox(x, y, newWidth, newHeight);

    const pdfBytes = await pdfDoc.save();

    // Auto-save the file to the 'label' directory with a unique name
    const userDataPath = app.getPath('userData');
    const labelDir = path.join(userDataPath, 'label');

    // Create the 'label' directory if it doesn't exist
    if (!fs.existsSync(labelDir)) {
      fs.mkdirSync(labelDir, { recursive: true });
    }
    const timestamp = new Date().getTime();
    const filePath = path.join(labelDir, `cropped-label-${timestamp}.pdf`);
    
    fs.writeFileSync(filePath, pdfBytes);
    console.log(`Cropped PDF saved to: ${filePath}`);
    // Return the path AND the data for the frontend to use
    return { success: true, path: filePath, data: pdfBytes };
  } catch (error) {
    console.error('Cropping error:', error.message);
    return { error: error.message };
  }
});

// Handle PDF Printing
ipcMain.handle('print-pdf', async (event, pdfData) => {
  try {
    const pdfBase64 = Buffer.from(pdfData).toString('base64');
    const dataUrl = `data:application/pdf;base64,${pdfBase64}`;

    // Create a new, hidden window
    const printWindow = new BrowserWindow({ show: false });

    await printWindow.loadURL(dataUrl);

    // Wait a moment for the PDF viewer to load before printing
    setTimeout(() => {
      printWindow.webContents.print({}, (success, failureReason) => {
        if (!success) {
          console.error('Printing failed:', failureReason);
        } else {
          console.log('Print dialog opened successfully.');
        }
        // Clean up the hidden window
        printWindow.close();
      });
    }, 1000);

    return { success: true };
  } catch (error) {
    console.error('Printing error:', error.message);
    return { error: error.message };
  }
});
