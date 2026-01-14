import React, { useRef, useEffect, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { setupPdfJsWorker } from './setupPdfJsWorker';

function PdfCanvas({ pdfData, onCropComplete }) {
  const canvasRef = useRef(null);
  const [pdfPage, setPdfPage] = useState(null);
  const [pageRotation, setPageRotation] = useState(0);
  const [cropRect, setCropRect] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState({ x: 0, y: 0 });
  const [isProcessing, setIsProcessing] = useState(false);

  const getMousePos = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const currentPos = getMousePos(e);
      const clampedX = Math.max(0, Math.min(currentPos.x, canvas.width));
      const clampedY = Math.max(0, Math.min(currentPos.y, canvas.height));
      const x = Math.min(startPoint.x, clampedX);
      const y = Math.min(startPoint.y, clampedY);
      const width = Math.abs(clampedX - startPoint.x);
      const height = Math.abs(clampedY - startPoint.y);
      setCropRect({ x, y, width, height });
    };

    const handleMouseUp = () => {
      setIsDrawing(false);
    };

    if (isDrawing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDrawing, startPoint]);

  const handleMouseDown = (e) => {
    e.preventDefault();
    setCropRect(null);
    setStartPoint(getMousePos(e));
    setIsDrawing(true);
  };
  
  useEffect(() => {
    const loadPdf = async () => {
      try {
        await setupPdfJsWorker();
        const dataForPdfJs = pdfData.slice(0);
        const loadingTask = pdfjsLib.getDocument({ data: dataForPdfJs });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);
        setPdfPage(page);
        setPageRotation(page.rotate);

        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        const viewport = page.getViewport({ scale: 1.5 });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = { canvasContext: context, viewport: viewport };
        await page.render(renderContext).promise;
      } catch (error) {
        console.error('Error in loadPdf:', error);
      }
    };
    if (pdfData) {
      loadPdf();
    }
  }, [pdfData]);
  
  const handleCropAndSave = async () => {
    if (!cropRect || !pdfPage) {
        alert('Please select an area to crop.');
        return;
    }
    setIsProcessing(true);

    const renderScale = 1.5;
    const pdfCoords = {
      x: cropRect.x / renderScale,
      y: cropRect.y / renderScale,
      width: cropRect.width / renderScale,
      height: cropRect.height / renderScale,
      rotation: pageRotation
    };

    try {
        const result = await window.electron.cropAndSavePdf(pdfData, pdfCoords);
        onCropComplete(result);
    } catch (err) {
        onCropComplete({ success: false, error: err.message });
    } finally {
        setIsProcessing(false);
    }
  };

  return (
    <div>
      <div
        className="canvas-container"
        onMouseDown={handleMouseDown}
      >
        <canvas ref={canvasRef} />
        {cropRect && (
          <div
            className="crop-box"
            style={{
              left: cropRect.x + 'px',
              top: cropRect.y + 'px',
              width: cropRect.width + 'px',
              height: cropRect.height + 'px',
            }}
          />
        )}
      </div>
      {pdfPage && (
        <button onClick={handleCropAndSave} disabled={isProcessing} style={{ marginTop: '1rem' }}>
            {isProcessing ? 'Processing...' : 'Crop & Save PDF'}
        </button>
      )}
    </div>
  );
}

export default PdfCanvas;
