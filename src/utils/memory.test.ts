import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fs, vol } from 'memfs';

import { readFile } from 'node:fs/promises';
import { Memory } from './memory';

vi.mock('node:fs/promises', () => fs.promises);
vi.mock('node:fs', () => fs);

describe('Memory', () => {
	const path = '/workspace/memory.yml';

	beforeEach(() => {
		vol.reset();
	});

	it('throws an error when trying to add an empty fact', () => {
		const mem = new Memory({ path });
		expect(() => mem.add('')).toThrow();
	});

	it('throws an error when trying to add a new fact over the limit', () => {
		const mem = new Memory({ path });
		mem.lengthLimit = '- Hello!'.length;
		expect(() => mem.add('Hello!')).not.toThrow();
		expect(() => mem.add('World!')).toThrow();
	});

	it('throws an error when trying to remove a fact using an empty query', () => {
		const mem = new Memory({ path });
		mem.add('Hello!');
		mem.add('World!');
		expect(() => mem.remove('')).toThrow('Search query cannot be empty.');
	});

	it('throws an error when trying to remove a fact using a non-matching query', () => {
		const mem = new Memory({ path });
		mem.add('Hello!');
		mem.add('World!');
		expect(() => mem.remove('Bye!')).toThrow('No facts matched the query "Bye!".');
	});

	it('throws an error when trying to remove a fact using a fuzzy query', () => {
		const mem = new Memory({ path });
		mem.add('Hello!');
		mem.add('World!');
		expect(() => mem.remove('!')).toThrow('No facts matched the query "!".');
	});

	it('implements fact addition and removal functionality', () => {
		const mem = new Memory({ path });
		mem.add('Hello!');
		mem.add('World!');
		expect(mem.list()).toEqual(['Hello!', 'World!']);
		mem.remove('Hello');
		mem.remove('World');
		expect(mem.length).toEqual(0);
	});

	it('implements fact deduplication', () => {
		const mem = new Memory({ path });
		mem.add('My name is Palma!');
		mem.add('Name is Palma!');
		expect(mem.list()).toEqual(['Name is Palma!']);
		mem.reset();
		mem.add('User likes TypeScript');
		mem.add('User prefers dark mode');
		expect(mem.list()).toEqual(['User likes TypeScript', 'User prefers dark mode']);
	});

	it('implements format functionality', () => {
		const mem = new Memory({ path });
		expect(mem.format()).toEqual('');
		mem.add('Hello!');
		mem.add('World!');
		expect(mem.format()).toEqual(['- Hello!', '- World!'].join('\n'));
	});

	it('implements save and load functionality', async () => {
		const memA = new Memory({ path });
		memA.add('Hello!');
		memA.add('World!');
		await memA.save();
		expect(await readFile(path, 'utf-8')).toBeTypeOf('string');
		const memB = new Memory({ path });
		await memB.load();
		expect(memB.list()).toEqual(['Hello!', 'World!']);
	});
});
