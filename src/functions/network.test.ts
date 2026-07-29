import { describe, it, expect, vi, beforeEach } from 'vitest';
import { networkFetch, networkRead } from './network';
import { Agent } from '../agent';

const mockAgent = (approved: boolean = true, browserMock?: any) => {
	const agent: Partial<Agent> = {
		confirm: vi.fn().mockResolvedValue(approved),
		browser: {
			loaded: true,
			readMarkdown: vi.fn().mockResolvedValue({
				title: 'Mock Title',
				body: '# Hello',
			}),
			...browserMock,
		},
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
				{ url: 'https://example.com', timeout: null, maxLength: null },
				mockAgent(),
			);
			expect(global.fetch).toHaveBeenCalled();
			expect(result).toEqual({
				body: '<html>data</html>',
			});
		});

		it('aborts if the user rejects the command', async () => {
			const result = await networkFetch.handler(
				{ url: 'https://example.com', timeout: null, maxLength: null },
				mockAgent(false),
			);
			expect(result.error).toContain('rejected');
			expect(global.fetch).not.toHaveBeenCalled();
		});

		it('returns an error if the HTTP response is not ok', async () => {
			mockFetchResult(false, 404, 'Not Found', '');
			const result = await networkFetch.handler(
				{ url: 'https://example.com', timeout: null, maxLength: null },
				mockAgent(),
			);
			expect(result.error).toContain('HTTP 404 Not Found');
		});

		it('truncates content larger than 8000 characters', async () => {
			mockFetchResult(true, 200, 'OK', 'x'.repeat(10000));
			const result = await networkFetch.handler(
				{ url: 'https://example.com', timeout: null, maxLength: null },
				mockAgent(),
			);
			expect(result).toMatchObject({
				body: expect.stringContaining('Truncated'),
			});
		});

		it('catches and returns fetch errors', async () => {
			mockFetchError(new Error('Network failure'));
			const result = await networkFetch.handler(
				{ url: 'https://example.com', timeout: null, maxLength: null },
				mockAgent(),
			);
			expect(result.error).toContain('Network failure');
		});
	});

	describe('networkRead', () => {
		it('reads a URL via the headless browser and returns markdown content', async () => {
			const browserMock = {
				loaded: true,
				readMarkdown: vi.fn().mockResolvedValue({
					title: 'Example',
					body: '# Hello',
				}),
			};
			const agent = mockAgent(true, browserMock);
			const result = await networkRead.handler(
				{ url: 'https://example.com', timeout: null, maxLength: null },
				agent,
			);
			expect(browserMock.readMarkdown).toHaveBeenCalled();
			expect(result).toEqual({
				title: 'Example',
				body: '# Hello',
			});
		});

		it('aborts if the user rejects the command', async () => {
			const browserMock = { readMarkdown: vi.fn() };
			const agent = mockAgent(false, browserMock);
			const result = await networkRead.handler(
				{ url: 'https://example.com', timeout: null, maxLength: null },
				agent,
			);
			expect(browserMock.readMarkdown).not.toHaveBeenCalled();
			expect(result).toMatchObject({
				error: expect.stringContaining('rejected'),
			});
		});

		it('truncates body content larger than 8000 characters', async () => {
			const browserMock = {
				readMarkdown: vi.fn().mockResolvedValue({
					title: 'Example',
					body: 'x'.repeat(10000),
				}),
			};
			const agent = mockAgent(true, browserMock);
			const result = await networkRead.handler(
				{ url: 'https://example.com', timeout: null, maxLength: null },
				agent,
			);
			expect(result).toMatchObject({
				body: expect.stringContaining('Truncated due to length'),
			});
		});

		it('catches and returns browser errors', async () => {
			const browserMock = {
				readMarkdown: vi.fn().mockRejectedValue(new Error('Browser crashed')),
			};
			const agent = mockAgent(true, browserMock);
			const result = await networkRead.handler(
				{ url: 'https://example.com', timeout: null, maxLength: null },
				agent,
			);
			expect(result).toMatchObject({
				error: expect.stringContaining('Failed to read URL: Browser crashed'),
			});
		});
	});
});
