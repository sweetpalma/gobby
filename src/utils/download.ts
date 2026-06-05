import { join } from 'node:path';
import { createWriteStream } from 'node:fs';
import { mkdirSync, statSync, renameSync } from 'node:fs';
import { ReadableStream } from 'node:stream/web';
import { Readable } from 'node:stream';

import * as clack from '@clack/prompts';
import { downloadFile } from '@huggingface/hub';
import isOnline from 'is-online';

/**
 * Hugging Face Model Downloader Options.
 */
export interface DownloadOptions {
	repo: string;
	path: string;
	outputDir: string;
}

/**
 * Hugging Face Model Downloader.
 */
export async function downloadModel(opts: DownloadOptions): Promise<string> {
	const { repo, path, outputDir } = opts;
	const destPath = join(outputDir, path);

	const existing = statSync(destPath, { throwIfNoEntry: false });
	if (existing) {
		return destPath;
	} else {
		clack.log.message('Brain is not found, fetching from Hugging Face...', {
			spacing: 0,
		});
	}

	if (!(await isOnline())) {
		throw new Error('Failed to establish network connection.');
	}

	const blob = await downloadFile({ repo, path });
	if (!blob) {
		throw new Error(`Failed to resolve remote file "${path}" in repo "${repo}".`);
	} else {
		mkdirSync(outputDir, { recursive: true });
	}

	const tempPath = `${destPath}.part`;
	const existingSize = statSync(tempPath, { throwIfNoEntry: false })?.size ?? 0;
	const totalSize = blob.size;

	const bar = clack.progress({ max: totalSize, withGuide: false });
	bar.start();
	bar.advance(existingSize);

	const blobRemains = existingSize > 0 ? blob.slice(existingSize) : blob;
	const nodeStream = Readable.fromWeb(blobRemains.stream() as ReadableStream);
	const writeStream = createWriteStream(tempPath, {
		flags: existingSize > 0 ? 'a' : 'w',
	});

	let downloadedBytes = existingSize;
	await new Promise<void>((resolve, reject) => {
		nodeStream.on('data', (chunk: Buffer) => {
			downloadedBytes = downloadedBytes + chunk.length;
			const percentage = Math.floor((downloadedBytes / totalSize) * 100);
			bar.advance(chunk.length, `Downloading (${percentage}%)`);
		});

		nodeStream.on('error', (err) => {
			bar.error(err.message);
			reject(err);
		});

		writeStream.on('error', (err) => {
			bar.error(err.message);
			reject(err);
		});

		writeStream.on('finish', () => {
			bar.clear();
			clack.log.message('Download complete.', { spacing: 0 });
			resolve();
		});

		nodeStream.pipe(writeStream);
	});

	renameSync(tempPath, destPath);
	return destPath;
}
