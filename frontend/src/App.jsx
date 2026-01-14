import React, { useState } from 'react';
import PdfCanvas from './PdfCanvas';
import CroppedPreview from './CroppedPreview';

function App() {
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfData, setPdfData] = useState(null);
  const [croppedPdf, setCroppedPdf] = useState(null); // State for the cropped PDF result
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    if (!pdfUrl) {
      setError('Please enter a PDF URL.');
      return;
    }
    setError('');
    setLoading(true);
    setPdfData(null);
    setCroppedPdf(null); // Reset cropped view on new download

    try {
      const result = await window.electron.downloadPdf(pdfUrl);
      if (result.error) {
        throw new Error(result.error);
      }
      setPdfData(result);
    } catch (err) {
      setError(`Failed to download PDF: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCropComplete = (result) => {
    if (result.success) {
      setCroppedPdf(result);
      // Hide the original cropper UI
      setPdfData(null); 
    } else {
      alert(`Cropping failed: ${result.error || 'An unknown error occurred.'}`);
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
        alert(`Failed to print: ${err.message}`);
      }
    }
  };

  return (
    <div className="container">
      <h1>PDF Label Cropper</h1>
      <div className="input-group">
        <input
          type="text"
          value={pdfUrl}
          onChange={(e) => setPdfUrl(e.target.value)}
          placeholder="Paste direct PDF URL here"
          disabled={loading}
        />
        <button onClick={handleDownload} disabled={loading}>
          {loading ? 'Downloading...' : 'Load PDF'}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {pdfData && <PdfCanvas pdfData={pdfData} onCropComplete={handleCropComplete} />}
      
      {croppedPdf && <CroppedPreview croppedPdf={croppedPdf} onPrint={handlePrint} />}
    </div>
  );
}

export default App;
