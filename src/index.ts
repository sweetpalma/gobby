import { join } from 'node:path';
import * as clack from '@clack/prompts';

import * as functions from './functions';
import { downloadModel, loadModel, MODEL_REPO_NAME } from './model';
import { SYSTEM_PROMPT } from './prompts/system';
import { Queue } from './utils/queue';

const spinner = clack.spinner({
	withGuide: false,
});

clack.intro('Gobby Agent v1.0');
clack.log.message(`Brain: ${MODEL_REPO_NAME}`, {
	spacing: 0,
});

const modelPath = await downloadModel();
spinner.start('Warming up...');
const session = await loadModel(modelPath, SYSTEM_PROMPT);
spinner.stop('Agent is ready.');

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

		let stream = new Queue();
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
						stream.push(chunk);
						buffer = buffer + chunk;
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
