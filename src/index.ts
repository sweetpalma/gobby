#!/usr/bin/env node
import { realpathSync as resolve } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as clack from '@clack/prompts';

import * as functions from './functions';
import { Model } from './model';
import { SYSTEM_PROMPT } from './prompts/system';
import { downloadModel } from './utils/download';
import { Queue } from './utils/queue';
import { config } from './config';

const spinner = clack.spinner({
	withGuide: false,
});

const load = async () => {
	await config.load();
	clack.intro('Gobby Agent v1.0');
	clack.log.message(`Brain: ${config.get('modelRepo')}`, {
		spacing: 0,
	});

	const path = await downloadModel({
		repo: config.get('modelRepo'),
		path: config.get('modelPath'),
		outputDir: config.modelsPath,
	});

	spinner.start('Brain installed, warming up...');
	const session = await (new Model({ path, systemPrompt: SYSTEM_PROMPT })).load();
	spinner.stop('Agent is ready.');
	return session;
};

const main = async () => {
	const session = await load();
	while (true) {
		try {
			const promptText = await clack.text({
				message: 'Human',
				placeholder: 'Type a message or press CTRL+C to quit...',
			});
			if (clack.isCancel(promptText)) {
				break;
			}
			const cleanPrompt = promptText.trim();
			if (!cleanPrompt) {
				continue;
			}

			clack.log.message();
			spinner.start('Thinking...');

			let stream = new Queue<string>();
			let buffer = '';

			await session
				.promptWithMeta(cleanPrompt, {
					functions,
					temperature: 0.75,
					onTextChunk: (chunk) => {
						if (buffer.length > 0 || chunk.trim().length > 0) {
							if (buffer.length === 0) {
								spinner.clear();
								clack.log.message('\x1b[A\x1b[A\x1b[A');
								clack.stream.info(stream);
								stream.push('Gobby\n');
							}
							buffer = buffer + chunk;
							stream.push(chunk);
						}
					},
				})
				.finally(() => {
					stream.close();
				});
		} catch (err) {
			const msg = err instanceof Error ? err.message : `${err}`;
			spinner.error(`An error occurred:`);
			clack.log.message(msg, {
				spacing: 0,
			});
		}
	}
};

if (resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
	main();
}
