import zlib from 'zlib';
import { promisify } from 'util';
import { pipeline } from 'stream/promises';
import fs from 'fs';

// Promisified compression functions
const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);
const brotliCompress = promisify(zlib.brotliCompress);
const brotliDecompress = promisify(zlib.brotliDecompress);

/**
 * Compression levels
 */
export const CompressionLevel = {
  FAST: 1,
  DEFAULT: 6,
  BEST: 9
};

/**
 * Compression algorithms
 */
export const Algorithm = {
  GZIP: 'gzip',
  BROTLI: 'brotli',
  // "Stored" mode: payload kept verbatim because compressing it made it bigger.
  NONE: 'none'
};

/**
 * Compress data using gzip
 */
export async function compressGzip(data, level = CompressionLevel.DEFAULT) {
  return gzip(data, { level });
}

/**
 * Decompress gzip data
 */
export async function decompressGzip(data) {
  return gunzip(data);
}

/**
 * Compress data using Brotli (better for text/web content)
 */
export async function compressBrotli(data, level = CompressionLevel.DEFAULT) {
  return brotliCompress(data, {
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: level
    }
  });
}

/**
 * Decompress Brotli data
 */
export async function decompressBrotli(data) {
  return brotliDecompress(data);
}

/**
 * Create gzip compression stream
 */
export function createGzipStream(level = CompressionLevel.DEFAULT) {
  return zlib.createGzip({ level });
}

/**
 * Create gzip decompression stream
 */
export function createGunzipStream() {
  return zlib.createGunzip();
}

/**
 * Create Brotli compression stream
 */
export function createBrotliCompressStream(level = CompressionLevel.DEFAULT) {
  return zlib.createBrotliCompress({
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: level
    }
  });
}

/**
 * Create Brotli decompression stream
 */
export function createBrotliDecompressStream() {
  return zlib.createBrotliDecompress();
}

/**
 * Compress a file using streaming (for large files)
 */
export async function compressFile(inputPath, outputPath, algorithm = Algorithm.GZIP, level = CompressionLevel.DEFAULT) {
  const input = fs.createReadStream(inputPath);
  const output = fs.createWriteStream(outputPath);
  
  const compressor = algorithm === Algorithm.BROTLI 
    ? createBrotliCompressStream(level)
    : createGzipStream(level);
  
  await pipeline(input, compressor, output);

  // Get compression stats
  const originalSize = fs.statSync(inputPath).size;
  let compressedSize = fs.statSync(outputPath).size;
  let usedAlgorithm = algorithm;

  // Gzip and Brotli both inflate tiny or already-compressed payloads (a 5-byte
  // file comes out at 25 bytes). Fall back to storing the bytes verbatim so a
  // transfer is never larger than the file it came from.
  if (compressedSize >= originalSize) {
    await pipeline(
      fs.createReadStream(inputPath),
      fs.createWriteStream(outputPath)
    );
    compressedSize = originalSize;
    usedAlgorithm = Algorithm.NONE;
  }

  return {
    originalSize,
    compressedSize,
    algorithm: usedAlgorithm,
    ...getCompressionRatio(originalSize, compressedSize)
  };
}

/**
 * Decompress a file using streaming
 */
export async function decompressFile(inputPath, outputPath, algorithm = Algorithm.GZIP) {
  const input = fs.createReadStream(inputPath);
  const output = fs.createWriteStream(outputPath);

  if (algorithm === Algorithm.NONE) {
    await pipeline(input, output);
    return fs.statSync(outputPath).size;
  }

  const decompressor = algorithm === Algorithm.BROTLI
    ? createBrotliDecompressStream()
    : createGunzipStream();

  await pipeline(input, decompressor, output);

  return fs.statSync(outputPath).size;
}

/**
 * Calculate compression ratio.
 * A zero-byte input has no meaningful ratio, so report a neutral 100%
 * rather than dividing by zero and leaking Infinity/NaN into the database.
 */
export function getCompressionRatio(originalSize, compressedSize) {
  const ratio =
    originalSize > 0
      ? Number(((compressedSize / originalSize) * 100).toFixed(2))
      : 100;

  return {
    ratio,
    savingsPercent: Number((100 - ratio).toFixed(2)),
    reduction: formatBytes(originalSize - compressedSize)
  };
}

/**
 * Format bytes to human readable. Handles negative deltas (compression can
 * inflate incompressible data) and non-finite input.
 */
export function formatBytes(bytes, decimals = 2) {
  if (!Number.isFinite(bytes)) return '0 Bytes';

  const abs = Math.abs(bytes);
  if (abs < 1) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(abs) / Math.log(k)));
  const value = parseFloat((abs / Math.pow(k, i)).toFixed(decimals));

  return `${bytes < 0 ? '-' : ''}${value} ${sizes[i]}`;
}

/**
 * Auto-select best compression algorithm based on file type
 */
export function selectAlgorithm(mimeType) {
  // Brotli is better for text-based content
  const textTypes = [
    'text/', 'application/json', 'application/javascript',
    'application/xml', 'application/xhtml', 'image/svg'
  ];
  
  for (const type of textTypes) {
    if (mimeType && mimeType.includes(type)) {
      return Algorithm.BROTLI;
    }
  }
  
  return Algorithm.GZIP;
}

export default {
  compressGzip,
  decompressGzip,
  compressBrotli,
  decompressBrotli,
  createGzipStream,
  createGunzipStream,
  createBrotliCompressStream,
  createBrotliDecompressStream,
  compressFile,
  decompressFile,
  getCompressionRatio,
  formatBytes,
  selectAlgorithm,
  CompressionLevel,
  Algorithm
};
