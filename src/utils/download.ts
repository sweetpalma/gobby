import { createWriteStream, mkdirSync, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { join } from 'node:path';

import { downloadFile } from '@huggingface/hub';
import * as cliProgress from 'cli-progress';

export interface DownloadOptions {
  repo: string;
  path: string;
  outputDir: string;
}

/**
 * Downloads a model from Hugging Face Hub.
 */
export async function downloadModel({ repo, path, outputDir }: DownloadOptions): Promise<string> {
  const blob = await downloadFile({ repo, path });
  if (!blob) {
    throw new Error(`Failed to resolve remote file "${path}" in repo "${repo}".`);
  }

  const totalSize = blob.size;
  const destPath = join(outputDir, path);

  const stat = statSync(destPath, { throwIfNoEntry: false });
  let existingSize = 0;

  if (stat) {
    existingSize = stat.size;
    if (existingSize === totalSize) {
      return destPath;
    } else if (existingSize > totalSize) {
      const existingGB = (existingSize / (1024 * 1024 * 1024)).toFixed(2);
      const totalGB = (totalSize / (1024 * 1024 * 1024)).toFixed(2);
      existingSize = 0;
    } else {
      const existingGB = (existingSize / (1024 * 1024 * 1024)).toFixed(2);
      const totalGB = (totalSize / (1024 * 1024 * 1024)).toFixed(2);
    }
  }

  mkdirSync(outputDir, { recursive: true });

  const bar = new cliProgress.SingleBar({
    etaBuffer: 2500,
    fps: 2,
    format: 'Downloading model | {bar} | {percentage}% | ETA: {eta}s | {value}/{total}',
    formatValue: (value, options, type) => {
      if (type === 'value' || type === 'total') {
        return (value / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
      }
      return String(value);
    },
  }, cliProgress.Presets.shades_classic);

  bar.start(totalSize, existingSize);

  const remainingBlob = existingSize > 0 ? blob.slice(existingSize) : blob;
  const nodeStream = Readable.fromWeb(remainingBlob.stream() as any);

  const writeStream = createWriteStream(destPath, { flags: existingSize > 0 ? 'a' : 'w' });
  let downloadedBytes = existingSize;

  await new Promise<void>((resolve, reject) => {
    nodeStream.on('data', (chunk: Buffer) => {
      downloadedBytes += chunk.length;
      bar.update(downloadedBytes);
    });

    nodeStream.on('error', (err) => {
      bar.stop();
      reject(err);
    });

    writeStream.on('error', (err) => {
      bar.stop();
      reject(err);
    });

    writeStream.on('finish', () => {
      bar.stop();
      resolve();
    });

    nodeStream.pipe(writeStream);
  });

  return destPath;
}
