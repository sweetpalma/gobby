#!/usr/bin/env node
import { homedir } from 'node:os';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';

import * as functions from './functions';
import { version } from '../package.json';
import { Agent } from './agent';
import { Config } from './utils/config';
import { render } from './ui/terminal';

// prettier-ignore
const args = new Command()
	.name('gobby')
	.version(version)
	.argument('[query...]')
	.parse();

const agent = new Agent({
	functions,
	config: new Config({
		workspace: process.env.GOBBY_WORKSPACE ?? join(homedir(), '.gobby'),
	}),
});

const main = async (initialPrompt?: string) => {
	const tui = render({ agent, initialPrompt });
	await agent.load();
	await tui.waitUntilExit();
};

const query = args.args.join(' ').trim();
const queryIsDefined = query.length > 0;
if (process.stdin.isTTY) {
	// prettier-ignore
	const initialPrompt = queryIsDefined ? query : 'Hello! Greet me in a very short manner.';
	main(initialPrompt);
} else {
	const piped = readFileSync(0).toString();
	const initialPrompt = queryIsDefined ? `${query}\n${piped}` : piped;
	main(initialPrompt);
}
