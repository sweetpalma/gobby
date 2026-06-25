import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fs, vol } from 'memfs';
import { memoryRemember, memoryForget, memoryStatus } from './memory';
import { Memory } from '../utils/memory';
import { Agent } from '../agent';

vi.mock('node:fs/promises', () => fs.promises);
vi.mock('node:fs', () => fs);

const mockAgent = () => {
	const memory = new Memory({ path: '/workspace/memory.yml', lengthLimit: 4096 });
	const agent: Partial<Agent> = {
		memory,
	};
	return agent as Agent;
};

describe('Tools (Memory)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vol.reset();
		vol.fromJSON({
			'/workspace': null,
		});
	});

	describe('memoryRemember', () => {
		it('adds a fact to memory and saves', async () => {
			const agent = mockAgent();
			const result = await memoryRemember.handler({ fact: 'User likes testing' }, agent);
			expect(result).toEqual({ result: 'Memorized (20/4096 characters used).' });
			const savedContent = fs.readFileSync('/workspace/memory.yml', 'utf-8');
			expect(savedContent).toContain('User likes testing');
		});

		it('returns an error if save fails', async () => {
			const agent = mockAgent();
			vol.mkdirSync('/workspace/memory.yml', { recursive: true }); // simulate folder existing
			const result = await memoryRemember.handler({ fact: 'User likes testing' }, agent);
			expect(result).toHaveProperty('error');
			expect((result as any).error).toContain('Failed to memorize');
		});
	});

	describe('memoryForget', () => {
		it('removes a fact from memory and saves', async () => {
			const agent = mockAgent();
			agent.memory.add('User likes testing');
			await agent.memory.save();
			const result = await memoryForget.handler({ query: 'testing' }, agent);
			expect(result).toEqual({ result: 'Forgotten.' });
			const savedContent = fs.readFileSync('/workspace/memory.yml', 'utf-8');
			expect(savedContent).not.toContain('User likes testing');
		});

		it('returns an error if removal fails', async () => {
			const agent = mockAgent();
			const result = await memoryForget.handler({ query: 'testing' }, agent);
			expect(result).toHaveProperty('error');
			expect((result as any).error).toContain('matched the query');
		});
	});

	describe('memoryStatus', () => {
		it('returns the current facts and usage string', async () => {
			const agent = mockAgent();
			agent.memory.add('User likes testing');
			agent.memory.add('Prefers dark mode');
			const result = await memoryStatus.handler({}, agent);
			expect(result).toEqual({
				facts: ['User likes testing', 'Prefers dark mode'],
				usage: '40/4096 characters used',
			});
		});
	});
});
