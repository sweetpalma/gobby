import { dirname, join } from 'node:path';
import { createWriteStream } from 'node:fs';
import { mkdirSync, statSync, renameSync } from 'node:fs';
import { ReadableStream } from 'node:stream/web';
import { Readable } from 'node:stream';

import chalk from 'chalk';
import isOnline from 'is-online';
import { downloadFile } from '@huggingface/hub';
import type { Terminal } from './terminal';

/**
 * Model Downloader Options.
 */
export interface DownloadModelOptions {
	repo: string;
	path: string;
	outputDir: string;
	tui?: Terminal;
}

/**
 * Blob Download Options.
 */
export interface DownloadBlobOptions {
	path: string;
	blob: Blob;
	tui?: Terminal;
}

export const downloadBlob = async ({ path, blob, tui }: DownloadBlobOptions) => {
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
	const startDownload = () => {
		return new Promise<void>((resolve, reject) => {
			let downloadedBytes = existingSize;
			inputStream.on('data', (chunk: Buffer) => {
				downloadedBytes = downloadedBytes + chunk.length;
				tui?.updateProgress(downloadedBytes);
			});
			inputStream.on('error', (err) => {
				reject(err);
			});
			writeStream.on('error', (err) => {
				reject(err);
			});
			writeStream.on('finish', () => {
				resolve();
			});
			inputStream.pipe(writeStream);
		});
	}
	tui?.startProgress(totalSize, existingSize);
	return startDownload().finally(() => {
		tui?.stopProgress();
		tui?.erase();
	});
};

/**
 * Hugging Face Model Downloader.
 */
export async function downloadModel(opts: DownloadModelOptions): Promise<string> {
	const { repo, path, outputDir, tui } = opts;
	const destPath = join(outputDir, path);
	const tempPath = `${destPath}.part`;
	if (statSync(destPath, { throwIfNoEntry: false })) {
		return destPath;
	}
	tui?.print('Brain missing!');
	tui?.print(chalk.gray('Scavenging Hugging Face for a new one...'));
	if (!(await isOnline())) {
		throw new Error('Failed to establish network connection.');
	}
	const blob = await downloadFile({ repo, path });
	if (!blob) {
		throw new Error(`Failed to resolve remote file "${path}" in repo "${repo}".`);
	}
	await downloadBlob({ tui, blob, path: tempPath });
	renameSync(tempPath, destPath);
	tui?.erase();
	return destPath;
}
