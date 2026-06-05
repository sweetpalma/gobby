import { dirname, join } from 'node:path';
import { createWriteStream } from 'node:fs';
import { mkdirSync, statSync, renameSync } from 'node:fs';
import { ReadableStream } from 'node:stream/web';
import { Readable } from 'node:stream';

import isOnline from 'is-online';
import { downloadFile } from '@huggingface/hub';

/**
 * Model Downloader Options.
 */
export interface DownloadModelOptions {
	repo: string;
	path: string;
	outputDir: string;
	onDownload?: (pct: number) => void;
	onProgress?: (pct: number) => void;
	onComplete?: () => void;
}

/**
 * Blob Download Options.
 */
export interface DownloadBlobOptions {
	path: string;
	blob: Blob;
	onDownload?: (pct: number) => void;
	onProgress?: (pct: number) => void;
	onComplete?: () => void;
}

export const downloadBlob = async ({ path, blob, ...events }: DownloadBlobOptions) => {
	const totalSize = blob.size;
	const existingSize = statSync(path, { throwIfNoEntry: false })?.size ?? 0;
	mkdirSync(dirname(path), {
		recursive: true,
	});
	const blobRemains = existingSize > 0 ? blob.slice(existingSize) : blob;
	const inputStream = Readable.fromWeb(blobRemains.stream() as ReadableStream);
	const writeStream = createWriteStream(path, {
		flags: existingSize > 0 ? 'a' : 'w',
	});
	events.onDownload?.call(null, Math.floor((existingSize / totalSize) * 100));
	return new Promise<void>((resolve, reject) => {
		let downloadedBytes = existingSize;
		inputStream.on('data', (chunk: Buffer) => {
			downloadedBytes = downloadedBytes + chunk.length;
			events.onProgress?.call(null, Math.floor((downloadedBytes / totalSize) * 100));
		});
		inputStream.on('error', (err) => {
			reject(err);
		});
		writeStream.on('error', (err) => {
			reject(err);
		});
		writeStream.on('finish', () => {
			events.onComplete?.call(null);
			resolve();
		});
		inputStream.pipe(writeStream);
	});
};

/**
 * Hugging Face Model Downloader.
 */
export async function downloadModel(opts: DownloadModelOptions): Promise<string> {
	const { repo, path, outputDir, ...events } = opts;
	const destPath = join(outputDir, path);
	const tempPath = `${destPath}.part`;
	if (statSync(destPath, { throwIfNoEntry: false })) {
		return destPath;
	}
	if (!(await isOnline())) {
		throw new Error('Failed to establish network connection.');
	}
	const blob = await downloadFile({ repo, path });
	if (!blob) {
		throw new Error(`Failed to resolve remote file "${path}" in repo "${repo}".`);
	}
	await downloadBlob({ blob, path: tempPath, ...events });
	renameSync(tempPath, destPath);
	return destPath;
}
