#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { realpathSync as resolve } from 'node:fs';
import { PassThrough } from 'node:stream';
import { homedir } from 'node:os';
import { join } from 'node:path';
import chalk from 'chalk';

import * as functions from './functions';
import { Agent, AgentAbort } from './agent';
import { Terminal } from './utils/terminal';
import { Config } from './utils/config';

const title = `                                           
┏┓          
┃┓┏┓┣┓┣┓┓┏
┗┛┗┛┗┛┗┛┗┫
v0.1.0   ┛
`;

const tui = new Terminal({
	maxLineLength: 80,
});

const agent = new Agent({
	functions,
	config: new Config({
		workspace: process.env.GOBBY_WORKSPACE ?? join(homedir(), '.gobby'),
	}),
});

const load = async () => {
	tui.print(chalk.green(title.trim()));
	tui.print();
	try {
		agent.on('download', (pct) => {
			tui.print('Brain missing!');
			tui.print(chalk.gray('Scavenging Hugging Face for a new one...'));
			tui.startProgress(100, pct);
		});
		agent.on('downloadProgress', (pct) => {
			tui.updateProgress(pct);
		});
		agent.on('downloadComplete', () => {
			tui.stopProgress();
			tui.print(chalk.gray('Download complete.'));
			tui.print();
		});
		agent.on('load', () => {
			tui.startSpinner('Warming up...');
		});
		agent.on('loadComplete', () => {
			tui.stopSpinner();
		});
		await agent.load();
	} catch (err) {
		tui.print(`${chalk.red('Error')}: ${err instanceof Error ? err.message : err}`);
		process.exit(-1);
	} finally {
		agent.removeAllListeners();
	}
};

const loop = async (initialPrompt?: string) => {
	while (true) {
		const prompt = await (async () => {
			if (initialPrompt) {
				const prompt = initialPrompt;
				initialPrompt = undefined;
				return prompt;
			}
			tui.print(chalk.dim('● Human'));
			const prompt = await tui.prompt({ prefix: chalk.dim('└ ') });
			if (prompt !== null) {
				tui.print();
				return prompt;
			} else {
				tui.print('Exiting...');
				tui.print();
				process.exit(0);
			}
		})();
		const stream = new PassThrough({ encoding: 'utf-8' });
		const abortController = new AbortController();
		const interruptHandler = () => {
			tui.stopSpinner();
			abortController.abort();
		};
		try {
			tui.once('interrupt', interruptHandler);
			tui.print(chalk.green('◆ Gobby'));
			tui.startSpinner('Thinking...');
			await Promise.all([
				tui.stream(stream, { prefix: chalk.green('└ ') }),
				agent.prompt({
					text: prompt.trim(),
					signal: abortController.signal,
					stream,
				}),
			]);
		} catch (err) {
			tui.stopSpinner();
			if (err instanceof AgentAbort) {
				tui.print(chalk.dim('[interrupted]'));
				continue;
			} else {
				const msg = `${chalk.red('Error')}: ${err instanceof Error ? err.message : err}`;
				tui.print(chalk.green('└ ') + msg);
			}
		} finally {
			tui.off('interrupt', interruptHandler);
			tui.print();
		}
	}
};

if (resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
	load().then(() => {
		const initialPrompt = 'Hello!';
		loop(initialPrompt);
	});
}
