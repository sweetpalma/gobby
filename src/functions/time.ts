import { defineChatSessionFunction } from 'node-llama-cpp';

export const datetime = defineChatSessionFunction({
	description: 'Get the current local date and time.',
	params: {
		type: 'object',
		properties: {},
	},
	handler: async () => {
		const now = new Date();
		return {
			iso: now.toISOString(),
			local: now.toLocaleString('en', { dateStyle: 'full', timeStyle: 'long' }),
			timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
		};
	},
});
