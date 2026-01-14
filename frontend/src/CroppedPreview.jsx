import React, { useRef, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { setupPdfJsWorker } from './setupPdfJsWorker';

function CroppedPreview({ croppedPdf, onPrint }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const render = async () => {
      try {
        await setupPdfJsWorker(); // Ensure worker is ready

        // Clone the data for pdf.js to prevent it from detaching the original buffer.
        const dataForPdfJs = croppedPdf.data.slice(0);
        const loadingTask = pdfjsLib.getDocument({ data: dataForPdfJs });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);
        
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        const viewport = page.getViewport({ scale: 1.5 });

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport,
          background: 'rgba(255,255,255,1)', // Force a white background
        };
        await page.render(renderContext).promise;
      } catch (error) {
        console.error("Error rendering cropped PDF:", error);
      }
    };

    if (croppedPdf && croppedPdf.data) {
      render();
    }
  }, [croppedPdf]);

  return (
    <div className="container" style={{marginTop: '2rem'}}>
      <h3>Cropped Result</h3>
      <p>Saved to: {croppedPdf.path}</p>
      <canvas ref={canvasRef} style={{ border: '1px solid #ccc' }} />
      <div style={{marginTop: '1rem', display: 'flex', gap: '1rem'}}>
        <button onClick={onPrint}>Print</button>
      </div>
    </div>
  );
}

export default CroppedPreview;
