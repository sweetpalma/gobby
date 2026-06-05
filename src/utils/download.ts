import { join } from 'node:path';
import { createWriteStream, mkdirSync, statSync } from 'node:fs';
import { ReadableStream } from 'node:stream/web';
import { Readable } from 'node:stream';

import * as clack from '@clack/prompts';
import { downloadFile } from '@huggingface/hub';

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
export async function downloadModel({
	repo,
	path,
	outputDir,
}: DownloadOptions): Promise<string> {
	const blob = await downloadFile({ repo, path });
	if (!blob) {
		throw new Error(`Failed to resolve remote file "${path}" in repo "${repo}".`);
	}

	const totalSize = blob.size;
	const destPath = join(outputDir, path);
	const stat = statSync(destPath, { throwIfNoEntry: false });
	mkdirSync(outputDir, { recursive: true });

	let existingSize = 0;
	if (stat) {
		existingSize = stat.size;
		if (existingSize === totalSize) {
			return destPath;
		} else if (existingSize > totalSize) {
			existingSize = 0;
		}
	}

	const bar = clack.progress({ max: totalSize, withGuide: false });
	bar.start();
	bar.advance(existingSize);

	const blobRemains = existingSize > 0 ? blob.slice(existingSize) : blob;
	const nodeStream = Readable.fromWeb(blobRemains.stream() as ReadableStream);
	const writeStream = createWriteStream(destPath, {
		flags: existingSize > 0 ? 'a' : 'w',
	});

	let downloadedBytes = existingSize;
	await new Promise<void>((resolve, reject) => {
		nodeStream.on('data', (chunk: Buffer) => {
			downloadedBytes = downloadedBytes + chunk.length;
			const percentage = Math.floor((downloadedBytes / totalSize) * 100);
			bar.advance(chunk.length, `${percentage}%`);
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
			bar.stop('Brain is installed.');
			resolve();
		});

		nodeStream.pipe(writeStream);
	});

	return destPath;
}
