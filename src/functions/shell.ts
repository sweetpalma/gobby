import { exec } from 'node:child_process';
import { analyze } from '../utils/shell';
import { Agent } from '../agent';

/**
 * Whitelisted commands.
 * Read-only or standard dev workflow commands only.
 */
const TRUSTED_COMMANDS: Array<{ name: string; args?: string[] }> = [
	{ name: 'git', args: ['status'] },
	{ name: 'git', args: ['diff'] },
	{ name: 'git', args: ['log'] },
	{ name: 'git', args: ['rev-parse'] },
	{ name: 'git', args: ['rev-list'] },
	{ name: 'git', args: ['describe'] },
	{ name: 'git', args: ['show'] },
	{ name: 'cat' },
	{ name: 'echo' },
	{ name: 'grep' },
	{ name: 'head' },
	{ name: 'ls' },
	{ name: 'tail' },
	{ name: 'tsc' },
	{ name: 'wc' },
	{ name: 'which' },
];

/**
 * Checks if command is a trusted expression.
 * @param name - Command name.
 * @param args - Command args.
 * @returns Binary trust status.
 */
const isTrusted = (name: string, args: Array<string>) => {
	return TRUSTED_COMMANDS.some((allowed) => {
		try {
			if (allowed.name !== name) {
				return false;
			} else if (!allowed.args) {
				return true;
			} else {
				return allowed.args.every((a, i) => {
					return args[i] === a;
				});
			}
		} catch {
			return false;
		}
	});
};

export const shellExecute = Agent.function({
	description:
		'Execute a single, non-interactive shell command in the current working directory. Use this to run build tools, tests, git commands, or any CLI operation.',
	params: {
		type: 'object',
		properties: {
			command: {
				type: 'string',
				description:
					'The shell command to execute (e.g. "npm test", "git status", "ls -la").',
			},
			timeout: {
				oneOf: [{ type: 'number' }, { type: 'null' }],
				description: 'Optional: Maximum execution time in seconds. Defaults to 30.',
			},
		},
	},
	handler: async ({ command, timeout }, agent: Agent) => {
		const trimmedCommand = command.trim();
		if (!trimmedCommand) {
			return { error: 'Command cannot be empty.' };
		}
		const trusted = (() => {
			try {
				const { calls, redirects } = analyze(trimmedCommand);
				const everyIsTrusted = calls.every((i) => isTrusted(i.name, i.args));
				return everyIsTrusted && calls.length > 0 && redirects.length === 0;
			} catch {
				return false;
			}
		})();
		if (!trusted) {
			const approved = await agent.confirm(trimmedCommand);
			if (!approved) {
				return {
					error: 'Command was rejected by the user.',
				};
			}
		}
		try {
			const timeoutMs = (timeout ?? 30) * 1000;
			const maxLength = 4096;
			const result = await new Promise<{
				stdout: string;
				stderr: string;
				exitCode: number;
				timedOut: boolean;
			}>((resolve) => {
				exec(
					trimmedCommand,
					{
						cwd: process.cwd(),
						timeout: timeoutMs,
						maxBuffer: 1024 * 1024,
						shell: process.env.SHELL ?? '/bin/sh',
						env: {
							...process.env,
							PAGER: 'cat',
							TERM: 'dumb',
						},
					},
					(error, stdout, stderr) => {
						resolve({
							stdout: stdout.trim(),
							stderr: stderr.trim(),
							exitCode: error ? (typeof error.code === 'number' ? error.code : -1) : 0,
							timedOut: !!error?.killed,
						});
					},
				);
			});
			return {
				stdout:
					result.stdout.slice(0, maxLength) +
					(result.stdout.length > maxLength ? '\n...(truncated)' : ''),
				stderr:
					result.stderr.slice(0, maxLength) +
					(result.stderr.length > maxLength ? '\n...(truncated)' : ''),
				exitCode: result.exitCode,
				...(result.timedOut && { timedOut: true }),
			};
		} catch (err) {
			return {
				error: `Failed to execute command: ${err instanceof Error ? err.message : err}`,
			};
		}
	},
});
