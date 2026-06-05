import { defineChatSessionFunction } from 'node-llama-cpp';

export const time = defineChatSessionFunction({
	description: 'Get the current local date and time.',
	params: {
		type: 'object',
		properties: {},
	},
	handler: async () => {
		const now = new Date();
		return {
			iso: now.toISOString(),
			local: now.toLocaleString(),
			timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
		};
	},
});
