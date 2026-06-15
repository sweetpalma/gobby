import { Agent } from '../agent';

export const networkFetch = Agent.function({
	description:
		'Fetch the raw content of a URL using a standard HTTP GET request. Returns the exact text response (e.g., raw HTML, JSON). Use this for APIs or when you explicitly need the raw source. For reading human-facing web pages or documentation, use httpRead instead.',
	params: {
		type: 'object',
		required: ['url'],
		properties: {
			url: {
				type: 'string',
				description: 'The full URL to fetch (e.g. "https://api.example.com/data.json").',
			},
		},
	},
	handler: async ({ url }, agent) => {
		try {
			const approved = await agent.confirm(url);
			if (!approved) {
				return {
					error: 'Command was rejected by the user.',
				};
			}
			const response = await fetch(url);
			if (!response.ok) {
				return {
					error: `Failed to fetch URL: HTTP ${response.status} ${response.statusText}`,
				};
			}
			let content = await response.text();
			const maxLength = 8000;
			if (content.length > maxLength) {
				content = content.substring(0, maxLength) + '\n\n...(Truncated due to length)';
			}
			return {
				url,
				content,
			};
		} catch (err) {
			return {
				error: `Failed to fetch URL: ${err instanceof Error ? err.message : err}`,
			};
		}
	},
});

export const networkRead = Agent.function({
	description:
		'Read and extract the main content of a web page by its URL. Uses a reader service that renders JavaScript and returns clean Markdown (stripping ads, navbars, and boilerplate). ALWAYS PREFER this over httpFetch for documentation, articles, and general web browsing.',
	params: {
		type: 'object',
		required: ['url'],
		properties: {
			url: {
				type: 'string',
				description: 'The full URL to read (e.g. "https://react.dev").',
			},
		},
	},
	handler: async ({ url }, agent) => {
		try {
			const approved = await agent.confirm(url);
			if (!approved) {
				return {
					error: 'Command was rejected by the user.',
				};
			}
			const readerUrl = `https://r.jina.ai/${url}`;
			const response = await fetch(readerUrl, {
				headers: {
					Accept: 'text/markdown',
				},
			});
			if (!response.ok) {
				return {
					error: `Failed to read URL: HTTP ${response.status} ${response.statusText}`,
				};
			}
			let content = await response.text();
			const maxLength = 8000;
			if (content.length > maxLength) {
				content = content.substring(0, maxLength) + '\n\n...(Truncated due to length)';
			}
			return {
				url,
				content,
			};
		} catch (err) {
			return {
				error: `Failed to read URL: ${err instanceof Error ? err.message : err}`,
			};
		}
	},
});
