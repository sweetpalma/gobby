import { default as picomatch } from 'picomatch';
import { Agent } from '../agent';

/**
 * Whitelisted resources.
 * Online resources that could be read without need to be confirmed.
 */
const TRUSTED_RESOURCES = [
	'?(*.)wikipedia.org',
	'?(*.)github.com',

	// Package registries:
	'?(*.)npmjs.org',
	'?(*.)npmjs.com',
	'?(*.)pypi.org',
	'?(*.)crates.io',
	'?(*.)pkg.go.dev',

	// Developer resources:
	'?(*.)developer.mozilla.org',
	'?(*.)stackoverflow.com',
	'?(*.)nodejs.org',
	'?(*.)typescriptlang.org',
	'?(*.)deno.com',
	'?(*.)python.org',
	'?(*.)docs.python.org',
	'?(*.)rust-lang.org',
	'?(*.)go.dev',
	'?(*.)ruby-lang.org',
];

/**
 * Checks if URL is a trusted source.
 * @param name - Command name.
 * @param args - Command args.
 * @returns Binary trust status.
 */
const isTrusted = (url: string) => {
	const { hostname } = new URL(url);
	return TRUSTED_RESOURCES.some((resource) => {
		const match = picomatch(resource);
		return match(hostname);
	});
};

export const networkFetch = Agent.function({
	description:
		'Fetch the raw content of a URL using a standard HTTP GET request. Returns the exact text response (e.g., raw HTML, JSON). Use this for APIs or when you explicitly need the raw source.',
	params: {
		type: 'object',
		properties: {
			url: {
				type: 'string',
				description: 'The full URL to fetch (e.g. "https://api.example.com/data.json").',
			},
			timeout: {
				oneOf: [{ type: 'number' }, { type: 'null' }],
				description: 'Optional: Request timeout in milliseconds. Defaults to 15000.',
			},
			maxLength: {
				oneOf: [{ type: 'number' }, { type: 'null' }],
				description: 'Optional: Maximum content size. Defaults to 8000.',
			},
		},
	},
	handler: async ({ url, timeout, maxLength }, agent) => {
		maxLength = maxLength ?? 8000;
		timeout = timeout ?? 15000;
		try {
			const trusted = isTrusted(url);
			if (!trusted) {
				const approved = await agent.confirm(`Read: \`${url}\``);
				if (!approved) {
					return {
						error: 'Request was rejected by the user.',
					};
				}
			}
			const response = await fetch(url, {
				signal: AbortSignal.timeout(timeout),
			});
			if (!response.ok) {
				return {
					error: `Failed to fetch URL: HTTP ${response.status} ${response.statusText}`,
				};
			}
			let body = await response.text();
			if (body.length > maxLength) {
				body = body.substring(0, maxLength);
				body = body + '\n\n...(Truncated due to length)';
			}
			return { body };
		} catch (err) {
			return {
				error: `Failed to fetch URL: ${err instanceof Error ? err.message : err}`,
			};
		}
	},
});

export const networkRead = Agent.function({
	description:
		'Read and extract the main content of a web page by its URL. Uses a reader service that renders JavaScript and returns clean Markdown (stripping ads, navbars, and boilerplate).',
	params: {
		type: 'object',
		properties: {
			url: {
				type: 'string',
				description: 'The full URL to read (e.g. "https://react.dev").',
			},
			timeout: {
				oneOf: [{ type: 'number' }, { type: 'null' }],
				description: 'Optional: Request timeout in milliseconds. Defaults to 15000.',
			},
			maxLength: {
				oneOf: [{ type: 'number' }, { type: 'null' }],
				description: 'Optional: Maximum content size. Defaults to 8000.',
			},
		},
	},
	handler: async ({ url, timeout, maxLength }, agent) => {
		maxLength = maxLength ?? 8000;
		timeout = timeout ?? 15000;
		try {
			const trusted = isTrusted(url);
			if (!trusted) {
				const approved = await agent.confirm(`Read: \`${url}\``);
				if (!approved) {
					return {
						error: 'Request was rejected by the user.',
					};
				}
			}
			if (!agent.browser.loaded) {
				const start = performance.now();
				await agent.browser.load();
				agent.logger.info('Loaded browser.', {
					elapsed: Math.trunc(performance.now() - start),
				});
			}
			const data = await agent.browser.readMarkdown(url, { timeout });
			if (data.body.length > maxLength) {
				data.body = data.body.substring(0, maxLength);
				data.body = data.body + '\n\n...(Truncated due to length)';
			}
			return data;
		} catch (err) {
			return {
				error: `Failed to read URL: ${err instanceof Error ? err.message : err}`,
			};
		}
	},
});
