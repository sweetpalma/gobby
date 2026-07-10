#!/usr/bin/env node
import { homedir } from 'node:os';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from '@commander-js/extra-typings';

import * as functions from './functions';
import { version } from '../package.json';
import { Agent } from './agent';
import { Config } from './utils/config';
import { render } from './ui/terminal';

const agent = new Agent({
	functions,
	config: new Config({
		workspace: process.env.GOBBY_WORKSPACE ?? join(homedir(), '.gobby'),
	}),
});

const examples = `
Examples:
	gobby 
	gobby "What have I recently committed?"
	gobby config show
	gobby config reset
	gobby memory show
	gobby memory clear
`;

const program = new Command()
	.name('gobby')
	.description('blazing fast gremlin agent that never leaves your machine')
	.version(version);

// prettier-ignore
const commandMemory = program
	.command('memory')
	.description('manage agent memories');
commandMemory
	.command('show')
	.description('show agent memories')
	.action(async () => {
		await agent.memory.load();
		console.log(agent.memory.format().trim());
	});
commandMemory
	.command('clear')
	.description('clear agent memories')
	.action(async () => {
		agent.memory.reset();
		await agent.memory.save();
	});

// prettier-ignore
const commandConfig = program
	.command('config')
	.description('manage agent config');
commandConfig
	.command('show')
	.description('show agent config')
	.action(async () => {
		await agent.config.load();
		console.log(agent.config.format().trim());
	});
commandConfig
	.command('reset')
	.description('reset agent config')
	.action(async () => {
		agent.config.reset();
		await agent.config.save();
	});

// prettier-ignore
program
	.argument('[query...]')
	.action(async (opts) => {
		const main = async (initialPrompt?: string) => {
			const tui = render({ agent, initialPrompt });
			await tui.waitUntilExit();
		};
		const query = opts.join(' ').trim();
		const queryIsDefined = query.length > 0;
		if (process.stdin.isTTY) {
			// prettier-ignore
			const initialPrompt = queryIsDefined ? query : 'Hello! Greet me in a very short manner.';
			await main(initialPrompt);
		} else {
			const piped = readFileSync(0).toString();
			const initialPrompt = queryIsDefined ? `${query}\n${piped}` : piped;
			await main(initialPrompt);
		}
	});

// prettier-ignore
program
	.addHelpText('after', examples.replace(/\t/g, ' '.repeat(2)).trimEnd())
	.parse();
