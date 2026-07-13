import { exec } from 'node:child_process';
import { Agent } from '../agent';

// Commands starting with these prefixes skip user confirmation.
// Read-only or standard dev workflow commands only.
const ALLOWLIST = [
	'cat',
	'echo',
	'find',
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
	'git diff',
	'git log',
	'git status',
	'git rev-parse',
	'git rev-list',
	'git describe',
	'git tag',
	'git branch',
	'git show',
];

// Shell metacharacters that indicate compound commands.
// The model is instructed not to use these, but small models ignore that rule.
// We enforce it here so the model gets a clear error and can self-correct.
const COMPOUND_PATTERNS = [
	{ pattern: /\|/, label: 'piping (|)' },
	{ pattern: /\$\(/, label: 'subshell expansion $()' },
	{ pattern: /`[^`]+`/, label: 'backtick subshell' },
	{ pattern: /&&/, label: 'command chaining (&&)' },
	{ pattern: /\|\|/, label: 'conditional chaining (||)' },
	{ pattern: /;/, label: 'command sequencing (;)' },
];

export const shellExecute = Agent.function({
	description:
		'Execute a single, non-interactive shell command in the current working directory. Safe commands (git, npm, ls, etc.) run automatically. Other commands require user confirmation. Use this to run build tools, tests, git commands, or any CLI operation.',
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
		const violation = COMPOUND_PATTERNS.find(({ pattern }) => {
			return pattern.test(command);
		});
		if (violation) {
			return {
				error: `Compound commands are not allowed: detected ${violation.label}. Call "shellExecute" once per simple command and combine the results yourself.`,
			};
		}
		const allowed = ALLOWLIST.some((prefix) => {
			return command === prefix || command.startsWith(prefix + ' ');
		});
		if (!allowed) {
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
