import Pica from 'pica';
import { PDFDocument } from 'pdf-lib';

/**
 * Returns the size of a Blob or File in Kilobytes (KB).
 */
export const getFileSizeKB = (file: Blob | File): number => {
  return Number((file.size / 1024).toFixed(2));
};

/**
 * Compresses an image to max 2MB while maintaining aspect ratio
 * and targeting 80-85% quality.
 */
export const compressImage = async (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    
    img.onload = async () => {
      try {
        URL.revokeObjectURL(img.src);
        
        let width = img.width;
        let height = img.height;
        
        // Downscale initial dimensions if extremely large to prevent browser crash
        const MAX_DIM = 2400;
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }
        
        // Use constructor instantiation with any casting to satisfy typescript compiler
        const pica = new (Pica as any)();
        
        const process = async (w: number, h: number, q: number): Promise<Blob> => {
          const srcCanvas = document.createElement('canvas');
          srcCanvas.width = img.width;
          srcCanvas.height = img.height;
          const srcCtx = srcCanvas.getContext('2d');
          if (!srcCtx) throw new Error('Failed to get 2D canvas context');
          srcCtx.drawImage(img, 0, 0);
          
          const destCanvas = document.createElement('canvas');
          destCanvas.width = w;
          destCanvas.height = h;
          
          await pica.resize(srcCanvas, destCanvas);
          return await pica.toBlob(destCanvas, 'image/jpeg', q);
        };
        
        // Start with target quality of 85%
        let quality = 0.85;
        let blob = await process(width, height, quality);
        
        // Iteratively compress further if size is still > 2MB (2048 KB)
        let attempts = 0;
        while (blob.size > 2 * 1024 * 1024 && attempts < 3) {
          attempts++;
          quality = 0.80; // drop quality to 80% as requested (target 80-85%)
          width = Math.round(width * 0.75);
          height = Math.round(height * 0.75);
          blob = await process(width, height, quality);
        }
        
        resolve(blob);
      } catch (err) {
        reject(err);
      }
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image for compression'));
    };
  });
};

/**
 * Compresses a PDF file using pdf-lib by re-saving with stream compression.
 */
export const compressPdf = async (file: File): Promise<Blob> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer);
  
  // Use useObjectStreams: true to compress the PDF streams
  const compressedBytes = await pdfDoc.save({ useObjectStreams: true });
  return new Blob([compressedBytes as any], { type: 'application/pdf' });
};

/**
 * Generic file compression dispatcher.
 */
export const compressFile = async (file: File): Promise<Blob> => {
  if (file.type.includes('image')) {
    return await compressImage(file);
  } else if (file.type === 'application/pdf') {
    return await compressPdf(file);
  }
  return file;
};
