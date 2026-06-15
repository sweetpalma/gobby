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
${chalk.green(' ▄▄ ▄██████▄ ▄▄')}   ${chalk.whiteBright('Gobby Agent v$VERSION$')}
${chalk.green('  ▀███ ██ ███▀ ')}   ${chalk.dim('Brain : $BRAIN$')}
${chalk.green('    ▀██████▀   ')}   ${chalk.dim('Memos : $MEMOS$')}
`;

// prettier-ignore
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

const load = async (showTitle?: boolean) => {
	// prettier-ignore
	const listeners: Array<Parameters<typeof agent['on']>> = [
		['download', (pct) => {
			tui.print('Brain missing!');
			tui.print(chalk.gray('Scavenging Hugging Face for a new one...'));
			tui.startProgress(100, pct);
		}],
		['downloadProgress', (pct) => {
			tui.updateProgress(pct);
		}],
		['downloadComplete', () => {
			tui.stopProgress();
			tui.print(chalk.gray('Installation complete.'));
			tui.print();
		}],
		['load', () => {
			tui.startSpinner('Warming up...');
		}],
		['loadComplete', () => {
			tui.stopSpinner();
		}],
		['init', () => {
			if (showTitle) {
				const infoTitle = title
					.replace('$BRAIN$', agent.config.get('modelRepo'))
					.replace('$MEMOS$', `${agent.memory.length}/${agent.memory.lengthLimit}`)
					.replace('$VERSION$', version);
				tui.print(infoTitle);
				tui.print();
			}
		}],
	];
	try {
		listeners.forEach((args) => {
			agent.on(...args);
		});
		await agent.load();
	} catch (err) {
		tui.print(formatError(err));
		process.exit(-1);
	} finally {
		listeners.forEach((args) => {
			agent.off(...args);
		});
	}
};

const loop = async (initialPrompt?: string, runOnce?: boolean) => {
	agent.on('confirm', async (message, resolve) => {
		try {
			tui.stopSpinner();
			tui.print(chalk.dim(`$ ${message}`));
			const answer = (
				await tui.prompt({ prefix: chalk.dim('  Confirm (Y/N)? ') })
			)?.trim();
			const isApproved = answer === 'yes' || answer === 'y' || answer === '';
			resolve(isApproved);
		} finally {
			tui.erase(2);
		}
	});
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
				await agent.dispose();
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
			if (agent.loaded) {
				tui.startSpinner('Thinking...');
			} else {
				tui.startSpinner('Waking up...');
			}
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
	const showTitle = true;
	load(showTitle).then(() => {
		const initialPrompt = queryIsDefined ? query : 'Hello!';
		const runOnce = queryIsDefined;
		loop(initialPrompt, runOnce);
	});
} else {
	const showTitle = false;
	load(showTitle)
		.then(() => tui.drain())
		.then((piped) => {
			const initialPrompt = queryIsDefined ? `${query}\n${piped}` : piped;
			const runOnce = true;
			loop(initialPrompt, runOnce);
		});
}
