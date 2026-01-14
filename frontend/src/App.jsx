import React, { useState, useEffect } from 'react';
import PdfCanvas from './PdfCanvas';
import CroppedPreview from './CroppedPreview';

function App() {
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfData, setPdfData] = useState(null);
  const [croppedPdf, setCroppedPdf] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState('');

  useEffect(() => {
    window.electron.getVersion().then((v) => setVersion(v));
  }, []);

  const handleDownload = async () => {
    if (!pdfUrl) {
      setError('Please enter a PDF URL.');
      return;
    }
    setError('');
    setLoading(true);
    setPdfData(null);
    setCroppedPdf(null);

    try {
      const result = await window.electron.downloadPdf(pdfUrl);
      if (result.error) {
        throw new Error(result.error);
      }
      setPdfData(result);
    } catch (err) {
      setError('Failed to download PDF: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenFile = async () => {
    setError('');
    setLoading(true);
    setPdfData(null);
    setCroppedPdf(null);

    try {
      const result = await window.electron.openPdfFile();
      if (result.canceled) {
        setLoading(false);
        return;
      }
      if (result.error) {
        throw new Error(result.error);
      }
      setPdfData(result);
    } catch (err) {
      setError('Failed to open PDF: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCropComplete = (result) => {
    if (result.success) {
      setCroppedPdf(result);
      setPdfData(null);
    } else {
      alert('Cropping failed: ' + (result.error || 'An unknown error occurred.'));
    }
  };

  const handlePrint = async () => {
    if (croppedPdf && croppedPdf.data) {
      try {
        const result = await window.electron.printPdf(croppedPdf.data);
        if (!result.success) {
          throw new Error(result.error || 'Unknown printing error');
        }
      } catch (err) {
        alert('Failed to print: ' + err.message);
      }
    }
  };

  return (
    <div className="container">
      <h1>PDF Label Cropper</h1>
      <p className="version">Version {version}</p>

      <div className="input-group">
        <input
          type="text"
          value={pdfUrl}
          onChange={(e) => setPdfUrl(e.target.value)}
          placeholder="Paste direct PDF URL here"
          disabled={loading}
        />
        <button onClick={handleDownload} disabled={loading}>
          {loading ? 'Loading...' : 'Load URL'}
        </button>
      </div>

      <div className="divider">
        <span>or</span>
      </div>

      <button className="file-button" onClick={handleOpenFile} disabled={loading}>
        Load PDF from File
      </button>

      {error && <p className="error">{error}</p>}

      {pdfData && <PdfCanvas pdfData={pdfData} onCropComplete={handleCropComplete} />}

      {croppedPdf && <CroppedPreview croppedPdf={croppedPdf} onPrint={handlePrint} />}
    </div>
  );
}

export default App;
