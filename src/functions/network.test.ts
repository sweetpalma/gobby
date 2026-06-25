import { describe, it, expect, vi, beforeEach } from 'vitest';
import { networkFetch, networkRead } from './network';
import { Agent } from '../agent';

const mockAgent = (approved: boolean = true) => {
	const agent: Partial<Agent> = {
		confirm: vi.fn().mockResolvedValue(approved),
	};
	return agent as Agent;
};

global.fetch = vi.fn();
const mockFetchResult = (
	ok: boolean,
	status: number,
	statusText: string,
	text: string,
) => {
	(global.fetch as any).mockResolvedValue({
		ok,
		status,
		statusText,
		text: vi.fn().mockResolvedValue(text),
	});
};

const mockFetchError = (error: Error) => {
	(global.fetch as any).mockRejectedValue(error);
};

describe('Tools (Network)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('networkFetch', () => {
		it('fetches a URL and returns its content', async () => {
			mockFetchResult(true, 200, 'OK', '<html>data</html>');
			const result = await networkFetch.handler(
				{ url: 'https://example.com' },
				mockAgent(),
			);
			expect(global.fetch).toHaveBeenCalledWith('https://example.com');
			expect(result).toEqual({
				url: 'https://example.com',
				content: '<html>data</html>',
			});
		});

		it('aborts if the user rejects the command', async () => {
			const result = await networkFetch.handler(
				{ url: 'https://example.com' },
				mockAgent(false),
			);
			expect(result.error).toContain('rejected');
			expect(global.fetch).not.toHaveBeenCalled();
		});

		it('returns an error if the HTTP response is not ok', async () => {
			mockFetchResult(false, 404, 'Not Found', '');
			const result = await networkFetch.handler(
				{ url: 'https://example.com' },
				mockAgent(),
			);
			expect(result.error).toContain('HTTP 404 Not Found');
		});

		it('truncates content larger than 8000 characters', async () => {
			mockFetchResult(true, 200, 'OK', 'x'.repeat(10000));
			const result = await networkFetch.handler(
				{ url: 'https://example.com' },
				mockAgent(),
			);
			expect(result).toMatchObject({
				content: expect.stringContaining('Truncated'),
			});
		});

		it('catches and returns fetch errors', async () => {
			mockFetchError(new Error('Network failure'));
			const result = await networkFetch.handler(
				{ url: 'https://example.com' },
				mockAgent(),
			);
			expect(result.error).toContain('Network failure');
		});
	});

	describe('networkRead', () => {
		it('reads a URL via jina.ai and returns markdown content', async () => {
			mockFetchResult(true, 200, 'OK', '# Hello');
			const result = await networkRead.handler(
				{ url: 'https://example.com' },
				mockAgent(),
			);
			expect(global.fetch).toHaveBeenCalledWith('https://r.jina.ai/https://example.com', {
				headers: { Accept: 'text/markdown' },
			});
			expect(result).toEqual({
				url: 'https://example.com',
				content: '# Hello',
			});
		});

		it('aborts if the user rejects the command', async () => {
			const result = await networkRead.handler(
				{ url: 'https://example.com' },
				mockAgent(false),
			);
			expect(result.error).toContain('rejected');
			expect(global.fetch).not.toHaveBeenCalled();
		});

		it('returns an error if the HTTP response is not ok', async () => {
			mockFetchResult(false, 500, 'Server Error', '');
			const result = await networkRead.handler(
				{ url: 'https://example.com' },
				mockAgent(),
			);
			expect(result.error).toContain('HTTP 500 Server Error');
		});

		it('truncates content larger than 8000 characters', async () => {
			mockFetchResult(true, 200, 'OK', 'x'.repeat(10000));
			const result = await networkRead.handler(
				{ url: 'https://example.com' },
				mockAgent(),
			);
			expect(result).toMatchObject({
				content: expect.stringContaining('Truncated'),
			});
		});

		it('catches and returns fetch errors', async () => {
			mockFetchError(new Error('DNS resolution failed'));
			const result = await networkRead.handler(
				{ url: 'https://example.com' },
				mockAgent(),
			);
			expect(result.error).toContain('DNS resolution failed');
		});
	});
});
