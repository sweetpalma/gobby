import { exec } from 'node:child_process';
import { Agent } from '../agent';

// Commands starting with these prefixes skip user confirmation.
// Read-only or standard dev workflow commands only.
const ALLOWLIST = [
	'cat',
	'echo',
	'find',
	'git diff',
	'git log',
	'git status',
	'grep',
	'head',
	'ls',
	'npm run',
	'npm test',
	'npx tsc',
	'tail',
	'tsc',
	'wc',
	'which',
];

// Commands containing these substrings are hard-blocked.
// Safety speed bump - not a security boundary.
const BLOCKLIST = [
	'rm -rf /',
	'sudo',
	'chmod 777 /',
	'chown -R',
	':(){ :|:& };:',
	'mkfs',
	'dd if=/dev/zero',
	'wget -qO- | sh',
	'curl | sh',
];

const isAllowlisted = (command: string) => {
	return ALLOWLIST.some((prefix) => command === prefix || command.startsWith(prefix + ' '));
};

const isBlocklisted = (command: string) => {
	return BLOCKLIST.some((blocked) => command.includes(blocked));
};

export const shellExecute = Agent.function({
	description:
		'Execute a single, non-interactive shell command in the current working directory. Safe commands (git, npm, ls, etc.) run automatically. Other commands require user confirmation. Use this to run build tools, tests, git commands, or any CLI operation.',
	params: {
		type: 'object',
		required: ['command'],
		properties: {
			command: {
				type: 'string',
				description:
					'The shell command to execute (e.g. "npm test", "git status", "ls -la").',
			},
			timeout: {
				type: 'number',
				description:
					'Maximum execution time in seconds. Defaults to 30.',
			},
		},
	},
	handler: async ({ command, timeout }, agent: Agent) => {
		const trimmedCommand = command.trim();
		if (!trimmedCommand) {
			return { error: 'Command cannot be empty.' };
		}
		if (isBlocklisted(trimmedCommand)) {
			return {
				error: `Command blocked for safety.`,
			};
		}
		if (!isAllowlisted(trimmedCommand)) {
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
				stdout: result.stdout.slice(0, maxLength) + (result.stdout.length > maxLength ? '\n...(truncated)' : ''),
				stderr: result.stderr.slice(0, maxLength) + (result.stderr.length > maxLength ? '\n...(truncated)' : ''),
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
