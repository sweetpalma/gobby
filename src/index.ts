#!/usr/bin/env node
import { homedir } from 'node:os';
import { PassThrough } from 'node:stream';
import { join } from 'node:path';

import chalk from 'chalk';
import { Command } from 'commander';

import * as functions from './functions';
import { Agent, AgentAbort } from './agent';
import { version } from '../package.json';
import { Terminal } from './utils/terminal';
import { Config } from './utils/config';

const title = `
┏┓        
┃┓┏┓┣┓┣┓┓┏
┗┛┗┛┗┛┗┛┗┫
v$VER$   ┛
`;

const args = new Command()
	.name('gobby')
	.version(version)
	.argument('[query...]')
	.parse();

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
	const titleWithVersion = title.trim().replace('$VER$', version);
	tui.print(chalk.green(titleWithVersion));
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
		tui.print(formatError(err));
		process.exit(-1);
	} finally {
		agent.removeAllListeners();
	}
};

const loop = async (initialPrompt?: string, runOnce?: boolean) => {
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
			if (runOnce) {
				return;
			}
		} catch (err) {
			tui.stopSpinner();
			if (err instanceof AgentAbort) {
				tui.print(chalk.dim('[interrupted]'));
				continue;
			} else {
				tui.print(chalk.green('└ ') + formatError(err));
			}
		} finally {
			tui.off('interrupt', interruptHandler);
			tui.print();
		}
	}
};

const formatError = (err: unknown) => {
	if (!(err instanceof Error)) {
		return `${chalk.red('Error')}: ${err}`;
	}
	if (!err.stack) {
		return `${chalk.red(err.name)}: ${err.message}`;
	}
	const prettyStack = err.stack.replace(err.name, chalk.red(err.name));
	return prettyStack;
};

const query = args.args.join(' ').trim();
const queryIsDefined = query.length > 0;
if (process.stdin.isTTY) {
	load().then(() => {
		const initialPrompt = queryIsDefined ? query : 'Hello!';
		const runOnce = queryIsDefined;
		loop(initialPrompt, runOnce);
	});
} else {
	load().then(() => tui.drain()).then((piped) => {
		const initialPrompt = queryIsDefined ? `${query}\n${piped}` : piped;
		const runOnce = true;
		loop(initialPrompt, runOnce);
	});
}
