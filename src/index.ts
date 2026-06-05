#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { realpathSync as resolve } from 'node:fs';
import { PassThrough } from 'node:stream';
import * as clack from '@clack/prompts';

import * as functions from './functions';
import { Model } from './model';
import { SYSTEM_PROMPT } from './prompts/system';
import { downloadModel } from './utils/download';
import { config } from './config';

const load = async () => {
	await config.load();
	clack.intro('Gobby Agent v1.0');
	clack.log.message(`Brain: ${config.get('modelRepo')}`, {
		spacing: 0,
	});
	const spinner = clack.spinner({
		withGuide: false,
	});
	try {
		const path = await downloadModel({
			repo: config.get('modelRepo'),
			path: config.get('modelPath'),
			outputDir: config.modelsPath,
		});
		spinner.start('Warming up...');
		const model = new Model({
			path,
			systemPrompt: SYSTEM_PROMPT,
			contextSize: config.get('contextSize'),
			functions,
		});
		await model.load();
		spinner.stop('Agent is ready.');
		return model;
	} catch (err) {
		spinner.clear();
		clack.log.error(`Error: ${err instanceof Error ? err.message : err}`, { spacing: 0 });
		process.exit(-1);
	}
};

const main = async () => {
	const model = await load();
	while (true) {
		const promptText = await clack.text({
			message: 'Human',
			placeholder: 'Type a message or press CTRL+C to quit...',
		});
		clack.log.message();
		if (clack.isCancel(promptText)) {
			break;
		}
		const cleanPrompt = promptText.trim();
		if (!cleanPrompt) {
			continue;
		}
		const stream = new PassThrough({ encoding: 'utf-8' });
		stream.once('data', (chunk) => {
			spinner.clear();
			clack.log.message('\x1b[A\x1b[A\x1b[A');
			clack.stream.info(stream);
			stream.write('Gobby\n');
			stream.write(chunk);
		});

		const abortController = new AbortController();
		const sigintHandler = () => abortController.abort();
		const spinner = clack.spinner({
			withGuide: false,
			signal: abortController.signal,
		});

		const originalExit = process.exit;
		process.exit = (code?: number) => {
			if (code === 0) {
				abortController.abort();
				return undefined as never;
			} else {
				return originalExit(code);
			}
		};

		try {
			process.on('SIGINT', sigintHandler);
			spinner.start('Thinking...');
			await Promise.all([
				model.prompt(cleanPrompt, stream, abortController.signal),
				new Promise<void>((resolve, reject) => {
					stream.once('close', () => {
						resolve();
					});
					stream.once('error', (err) => {
						reject(err);
					});
				}),
			]);
			if (abortController.signal.aborted) {
				continue;
			}
		} catch (err) {
			if (abortController.signal.aborted) {
				continue;
			}
			const msg = err instanceof Error ? err.message : `${err}`;
			spinner.error(`An error occurred:`);
			clack.log.message(msg, {
				spacing: 0,
			});
		} finally {
			process.off('SIGINT', sigintHandler);
			process.exit = originalExit;
		}
	}
};

if (resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
	main();
}
