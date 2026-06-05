import { join } from 'node:path';
import * as clack from '@clack/prompts';

import { SYSTEM_PROMPT } from './prompts/system';
import { downloadModel, loadModel, MODEL_REPO_NAME } from './model';
import * as functions from './functions';

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
		clack.log.message();

		if (clack.isCancel(promptText)) {
			break;
		}

		const cleanPrompt = promptText.trim();
		if (!cleanPrompt) {
			continue;
		}

		spinner.start('Thinking...');
		const response = await session.promptWithMeta(cleanPrompt, {
			functions,
		});

		spinner.stop('Gobby');
		clack.log.message(response.responseText.trim(), {
			spacing: 0,
		});
	} catch (err) {
		const msg = err instanceof Error ? err.message : `${err}`;
		spinner.error(`An error occurred:`);
		clack.log.message(msg, {
			spacing: 0,
		});
	}
}
