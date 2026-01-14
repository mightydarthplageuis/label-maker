import * as pdfjsLib from 'pdfjs-dist';

let workerPromise = null;

/**
 * Sets up the PDF.js worker by providing a relative path to the worker script.
 * This is wrapped in a singleton promise to ensure it only runs once.
 */
export const setupPdfJsWorker = () => {
  if (!workerPromise) {
    workerPromise = new Promise((resolve) => {
      // Since pdf.worker.min.mjs is in the `public` directory, Vite will copy it
      // to the root of the `dist` directory. We can then refer to it directly.
      // In development, Vite's dev server will also serve it from the root.
      const workerSrc = 'pdf.worker.min.mjs';
      
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
      console.log('PDF.js worker source set to:', workerSrc);
      resolve(true);
    });
  }
  return workerPromise;
};
