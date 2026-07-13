import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exec as mockExec } from 'node:child_process';
import { shellExecute } from './shell';
import { Agent } from '../agent';

vi.mock('node:child_process', () => ({
	exec: vi.fn(),
}));

const TEST_ALLOWLIST = [
	'ls',
	'ls -la',
	'git status',
	'git diff HEAD',
	'git log --oneline',
	'npm run build',
	'npm test',
	'grep foo src/index.ts',
	'cat README.md',
];

const TEST_COMPOUND = [
	['piping', 'ls | grep src'],
	['subshell expansion', 'echo $(pwd)'],
	['backtick subshell', 'echo `pwd`'],
	['chaining &&', 'npm install && npm test'],
	['conditional chaining ||', 'true || false'],
	['command sequencing ;', 'ls; echo done'],
];

const mockExecResult = (params: {
	stdout?: string;
	stderr?: string;
	killed?: boolean;
	exitCode?: number;
}) => {
	const { stdout = '', stderr = '', killed = false, exitCode = 0 } = params;
	(mockExec as any).mockImplementation((_cmd: string, _opts: unknown, cb: Function) => {
		const error =
			exitCode !== 0 || killed
				? Object.assign(new Error('exit'), { code: exitCode, killed })
				: null;
		cb(error, stdout, stderr);
		return { pid: 1 };
	});
};

const mockAgent = (approved: boolean = true) => {
	const agent: Partial<Agent> = {
		confirm: vi.fn().mockResolvedValue(approved),
	};
	return agent as Agent;
};

describe('Tools (Shell)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('shellExecute', () => {
		it('rejects an empty command', async () => {
			const result = await shellExecute.handler(
				{ command: ' ', timeout: null },
				mockAgent(),
			);
			expect(result).toMatchObject({ error: expect.stringContaining('empty') });
			expect(mockExec).not.toHaveBeenCalled();
		});

		it.each(TEST_COMPOUND)('rejects compound command: %s', async (_label, command) => {
			const result = await shellExecute.handler({ command, timeout: null }, mockAgent());
			expect(result).toMatchObject({ error: expect.stringContaining('Compound') });
			expect(mockExec).not.toHaveBeenCalled();
		});

		it.each(TEST_ALLOWLIST)('allows safe command: %s', async (command) => {
			mockExecResult({ stdout: 'ok' });
			const agent = mockAgent();
			const result = await shellExecute.handler({ command, timeout: null }, agent);
			expect(agent.confirm).not.toHaveBeenCalled();
			expect(result).toMatchObject({ exitCode: 0 });
		});

		it('asks for confirmation for unknown commands and runs them when approved', async () => {
			mockExecResult({ stdout: 'installed' });
			const agent = mockAgent(true);
			const result = await shellExecute.handler(
				{ command: 'npm install', timeout: null },
				agent,
			);
			expect(agent.confirm).toHaveBeenCalledWith('npm install');
			expect(result).toMatchObject({ stdout: 'installed', exitCode: 0 });
		});

		it('asks for confirmation for unknown commands and aborts when rejected', async () => {
			const agent = mockAgent(false);
			const result = await shellExecute.handler(
				{ command: 'npm install', timeout: null },
				agent,
			);
			expect(agent.confirm).toHaveBeenCalledWith('npm install');
			expect(result).toMatchObject({ error: expect.stringContaining('rejected') });
		});

		it('returns stdout and stderr from the child process', async () => {
			mockExecResult({ stdout: 'hello stdout', stderr: 'hello stderr', exitCode: 0 });
			const result = await shellExecute.handler(
				{ command: 'ls', timeout: null },
				mockAgent(),
			);
			expect(result).toMatchObject({
				stdout: 'hello stdout',
				stderr: 'hello stderr',
				exitCode: 0,
			});
			expect(result).not.toHaveProperty('error');
		});

		it('returns a non-zero exit code without treating it as an error', async () => {
			mockExecResult({ stdout: '', stderr: 'not found', exitCode: 1 });
			const result = await shellExecute.handler(
				{ command: 'ls', timeout: null },
				mockAgent(),
			);
			expect(result).toMatchObject({ exitCode: 1, stderr: 'not found' });
			expect(result).not.toHaveProperty('error');
		});

		it('truncates stdout longer than 4096 characters', async () => {
			mockExecResult({ stdout: 'x'.repeat(5000) });
			const result = await shellExecute.handler(
				{ command: 'cat README.md', timeout: null },
				mockAgent(),
			);
			expect(result).toMatchObject({ stdout: expect.stringContaining('truncated') });
			expect(result).not.toHaveProperty('error');
		});

		it('reports timedOut when the process is killed', async () => {
			mockExecResult({ killed: true, exitCode: -1 });
			const result = await shellExecute.handler(
				{ command: 'ls', timeout: null },
				mockAgent(),
			);
			expect(result).toMatchObject({ timedOut: true });
			expect(result).not.toHaveProperty('error');
		});

		it('does not include timedOut when the process completes normally', async () => {
			mockExecResult({ stdout: 'done' });
			const result = await shellExecute.handler(
				{ command: 'ls', timeout: null },
				mockAgent(),
			);
			expect(result).not.toHaveProperty('timedOut');
			expect(result).not.toHaveProperty('error');
		});
	});
});
