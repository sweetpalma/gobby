import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fs, vol } from 'memfs';
import glob from 'fast-glob';
import { Agent } from '../agent';
import {
	filesystemCurrentWorkingDirectory,
	filesystemList,
	filesystemRead,
	filesystemWrite,
	filesystemDelete,
	filesystemPatch,
	filesystemFind,
	filesystemGrep,
} from './filesystem';

vi.mock('fast-glob', () => ({ default: vi.fn() }));
vi.mock('node:fs/promises', () => fs.promises);
vi.mock('node:fs', () => fs);

const mockAgent = () => {
	return {} as Agent;
};

describe('Tools (Filesystem)', () => {
	const cwd = '/workspace';

	beforeEach(() => {
		vi.clearAllMocks();
		vol.reset();
		vol.fromJSON({
			'/workspace/file.txt': 'Hello world\nThis is a test file.',
			'/workspace/dir/nested.ts': 'console.log("nested");',
			'/workspace/large.txt': 'x'.repeat(20000),
			'/outside.txt': 'secret',
		});
		vi.spyOn(process, 'cwd').mockReturnValue(cwd);
	});

	describe('filesystemCurrentWorkingDirectory', () => {
		it('returns the current working directory', async () => {
			const result = await filesystemCurrentWorkingDirectory.handler({}, mockAgent());
			expect(result).toEqual({ cwd: '/workspace' });
		});
	});

	describe('filesystemList', () => {
		it('lists files and directories inside cwd', async () => {
			const result = await filesystemList.handler({ path: '.' }, mockAgent());
			expect(result).toMatchObject({
				directory: '/workspace',
				files: expect.arrayContaining([
					expect.objectContaining({ name: 'file.txt', type: 'file' }),
					expect.objectContaining({ name: 'dir', type: 'directory' }),
				]),
			});
		});

		it('blocks listing outside cwd', async () => {
			const result = await filesystemList.handler({ path: '../' }, mockAgent());
			expect(result.error).toContain('Access denied');
		});

		it('handles missing directories', async () => {
			const result = await filesystemList.handler({ path: './missing' }, mockAgent());
			expect(result.error).toContain('Failed to list files');
		});
	});

	describe('filesystemRead', () => {
		it('reads a file successfully', async () => {
			const result = await filesystemRead.handler(
				{ path: 'file.txt', maxSize: null },
				mockAgent(),
			);
			expect(result).toEqual({
				path: '/workspace/file.txt',
				content: 'Hello world\nThis is a test file.',
			});
		});

		it('blocks reading files outside cwd', async () => {
			const result = await filesystemRead.handler(
				{ path: '../outside.txt', maxSize: null },
				mockAgent(),
			);
			expect(result.error).toContain('Access denied');
		});

		it('blocks reading files larger than maxSize', async () => {
			const result = await filesystemRead.handler(
				{ path: 'large.txt', maxSize: null },
				mockAgent(),
			);
			expect(result).toHaveProperty('error');
			expect((result as any).error).toContain('File is too large');
		});

		it('allows reading large files if maxSize is increased', async () => {
			const result = await filesystemRead.handler(
				{ path: 'large.txt', maxSize: 25000 },
				mockAgent(),
			);
			expect(result).toHaveProperty('content');
		});
	});

	describe('filesystemWrite', () => {
		it('writes a new file inside cwd', async () => {
			const result = await filesystemWrite.handler(
				{ path: 'new.txt', content: 'new content' },
				mockAgent(),
			);
			expect(result).toMatchObject({
				path: '/workspace/new.txt',
				bytesWritten: 11,
			});
			expect(fs.readFileSync('/workspace/new.txt', 'utf-8')).toBe('new content');
		});

		it('blocks writing outside cwd', async () => {
			const result = await filesystemWrite.handler(
				{ path: '/new.txt', content: 'bad' },
				mockAgent(),
			);
			expect(result.error).toContain('Access denied');
		});
	});

	describe('filesystemDelete', () => {
		it('deletes a file inside cwd', async () => {
			const result = await filesystemDelete.handler({ path: 'file.txt' }, mockAgent());
			expect(result).toEqual({ path: '/workspace/file.txt', deleted: true });
			expect(fs.existsSync('/workspace/file.txt')).toBe(false);
		});

		it('blocks deleting outside cwd', async () => {
			const result = await filesystemDelete.handler(
				{ path: '../outside.txt' },
				mockAgent(),
			);
			expect(result.error).toContain('Access denied');
		});

		it('blocks deleting cwd itself', async () => {
			const result = await filesystemDelete.handler({ path: '.' }, mockAgent());
			expect(result.error).toContain('Cannot delete the current working directory');
		});
	});

	describe('filesystemPatch', () => {
		it('patches a file successfully using fuzzy match', async () => {
			const result = await filesystemPatch.handler(
				{ path: 'file.txt', search: 'Hello world', replace: 'Hi universe' },
				mockAgent(),
			);
			expect(result).toMatchObject({ path: '/workspace/file.txt' });
			expect(fs.readFileSync('/workspace/file.txt', 'utf-8')).toBe(
				'Hi universe\nThis is a test file.',
			);
		});

		it('fails patch when no match is found', async () => {
			const result = await filesystemPatch.handler(
				{ path: 'file.txt', search: 'Missing text', replace: 'Replaced text' },
				mockAgent(),
			);
			expect(result.error).toContain('Patch failed');
		});

		it('blocks patching outside cwd', async () => {
			const result = await filesystemPatch.handler(
				{ path: '../outside.txt', search: 'secret', replace: 'hacked' },
				mockAgent(),
			);
			expect(result.error).toContain('Access denied');
		});
	});

	describe('filesystemFind', () => {
		it('finds files matching glob pattern', async () => {
			vi.mocked(glob).mockResolvedValue(['file.txt', 'dir/nested.ts'] as never);
			const result = await filesystemFind.handler(
				{ pattern: '**/*.*', limit: null },
				mockAgent(),
			);
			expect(result).toEqual({
				pattern: '**/*.*',
				files: ['file.txt', 'dir/nested.ts'],
				total: 2,
				truncated: false,
			});
			expect(glob).toHaveBeenCalledWith('**/*.*', expect.any(Object));
		});

		it('truncates results over limit', async () => {
			const fakeFiles = Array.from({ length: 150 }, (_, i) => `file${i}.txt`);
			vi.mocked(glob).mockResolvedValue(fakeFiles as never);
			const result = await filesystemFind.handler(
				{ pattern: '*.txt', limit: null },
				mockAgent(),
			);
			expect(result).toMatchObject({
				total: 150,
				truncated: true,
			});
			expect((result as any).files).toHaveLength(100);
		});
	});

	describe('filesystemGrep', () => {
		it('greps files matching text', async () => {
			vi.mocked(glob).mockResolvedValue(['file.txt'] as never);
			const result = await filesystemGrep.handler(
				{ query: 'test file', caseSensitive: null, limit: null, pattern: null },
				mockAgent(),
			);
			expect(result).toMatchObject({
				query: 'test file',
				total: 1,
				truncated: false,
			});
			const matches = (result as any).matches;
			expect(matches).toHaveLength(1);
			expect(matches[0]).toEqual({
				file: 'file.txt',
				line: 2,
				content: 'This is a test file.',
			});
		});

		it('handles case-sensitive search', async () => {
			vi.mocked(glob).mockResolvedValue(['file.txt'] as never);
			const result = await filesystemGrep.handler(
				{ query: 'Hello', caseSensitive: true, limit: null, pattern: null },
				mockAgent(),
			);
			expect((result as any).matches).toHaveLength(1);
			const resultCaseMismatch = await filesystemGrep.handler(
				{ query: 'hello', caseSensitive: true, limit: null, pattern: null },
				mockAgent(),
			);
			expect((resultCaseMismatch as any).matches).toHaveLength(0);
		});
	});
});
