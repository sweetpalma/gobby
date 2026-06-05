import { join } from 'node:path';
import * as clack from '@clack/prompts';

import { SYSTEM_PROMPT } from './prompts/system';
import { createSession, MODEL_REPO_NAME } from './model';
import * as functions from './functions';

try {
	clack.intro('Symon Agent v1.0');
	clack.log.message(`Model: ${MODEL_REPO_NAME}`, {
		spacing: 0,
	});

	const loadingSpinner = clack.spinner();
	loadingSpinner.start('Warming up the agent...');
	const session = await createSession(SYSTEM_PROMPT);
	loadingSpinner.stop('Agent is ready.');

	while (true) {
		const promptText = await clack.text({
			message: 'User',
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

		const responseSpinner = clack.spinner({
			withGuide: false,
		});
		responseSpinner.start('Thinking...');
		const response = await session.prompt(cleanPrompt, {
			functions,
		});
		responseSpinner.stop('Model');
		clack.log.message(response.trim(), {
			spacing: 0,
		});
	}
} catch (error) {
	console.error('An error occurred:', error);
}
