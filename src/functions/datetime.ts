import { Agent } from '../agent';

export const datetime = Agent.function({
	description: 'Get the current local time and date.',
	params: {
		type: 'object',
		properties: {},
	},
	handler: () => {
		const now = new Date();
		return {
			iso: now.toISOString(),
			local: now.toLocaleString('en', { dateStyle: 'full', timeStyle: 'long' }),
			timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
		};
	},
});
