#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { realpathSync as resolve } from 'node:fs';
import { PassThrough } from 'node:stream';
import { homedir } from 'node:os';
import { join } from 'node:path';
import chalk from 'chalk';

import * as functions from './functions';
import { Model, ModelAbort } from './model';
import { SYSTEM_PROMPT } from './prompts/system';
import { downloadModel } from './utils/download';
import { Terminal } from './utils/terminal';
import { Config } from './config';

const tui = new Terminal();
const config = new Config(
	process.env.GOBBY_WORKSPACE ?? join(homedir(), '.gobby'),
);

const load = async () => {
	await config.load();
	tui.print('Gobby Agent v1.0');
	tui.print(chalk.dim(`Brain: ${config.get('modelRepo')}`));
	try {
		const path = await downloadModel({
			repo: config.get('modelRepo'),
			path: config.get('modelPath'),
			outputDir: config.modelsPath,
			tui,
		});
		tui.startSpinner('Warming up...');
		const model = new Model({
			path,
			functions,
			systemPrompt: SYSTEM_PROMPT,
			contextSize: config.get('contextSize'),
		});
		await model.load();
		tui.stopSpinner();
		tui.print(chalk.dim('Agent is ready.'));
		tui.print();
		return model;
	} catch (err) {
		tui.stopSpinner();
		tui.print(chalk.red(`Error: ${err instanceof Error ? err.message : err}`));
		process.exit(-1);
	}
};

const main = async () => {
	const model = await load();
	while (true) {
		tui.print(`${chalk.dim('●')} Human`);
		const prompt = await tui.prompt({ prefix: chalk.dim('└ ') });
		if (prompt !== null) {
			tui.print();
		} else {
			tui.print('Exiting...');
			tui.print();
			process.exit(0);
		}
		const stream = new PassThrough({ encoding: 'utf-8' });
		const abortController = new AbortController();
		const interruptHandler = () => {
			tui.stopSpinner();
			abortController.abort();
		};
		try {
			tui.once('interrupt', interruptHandler);
			tui.print(`${chalk.green('◆')} Gobby`);
			tui.startSpinner();
			await Promise.all([
				tui.stream(stream, { prefix: chalk.green('└ ') }),
				model.prompt({
					text: prompt.trim(),
					signal: abortController.signal,
					stream,
				}),
			]);
		} catch (err) {
			tui.stopSpinner();
			if (err instanceof ModelAbort) {
				tui.print(chalk.dim('(interrupted)'));
				continue;
			} else {
				tui.print(chalk.red(`Error: ${err instanceof Error ? err.message : err}`));
				continue;
			}
		} finally {
			tui.off('interrupt', interruptHandler);
			tui.print();
		}
	}
};

if (resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
	main();
}
