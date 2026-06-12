import { Agent } from '../agent';

export const memoryRemember = Agent.function({
	description:
		'Memorize an IMPORTANT fact about the user for future conversations. Use this when the user shares personal details, preferences, or anything worth remembering long-term. The fact should be a short, self-contained sentence.',
	params: {
		type: 'object',
		required: ['fact'],
		properties: {
			fact: {
				type: 'string',
				description:
					'A short, self-contained fact to remember (e.g. "The user\'s name is Alex." or "The user prefers dark mode.").',
			},
		},
	},
	handler: async ({ fact }, agent: Agent) => {
		try {
			const added = agent.memory.add(fact);
			if (!added) {
				return {
					error: 'Failed to memorize: Memory is probably full.',
				};
			}
			await agent.memory.save();
			return {
				result: `Memorized (${agent.memory.length}/${agent.memory.lengthLimit} characters used).`,
			};
		} catch (err) {
			return {
				error: `Failed to memorize: ${err instanceof Error ? err.message : err}`,
			};
		}
	},
});

export const memoryForget = Agent.function({
	description:
		'Forget a previously memorized fact about the user. Use this when the user asks you to forget something, or when a fact is no longer accurate.',
	params: {
		type: 'object',
		required: ['query'],
		properties: {
			query: {
				type: 'string',
				description:
					'A search query to match the fact to forget (e.g. "name" to forget a fact containing "name").',
			},
		},
	},
	handler: async ({ query }, agent: Agent) => {
		try {
			const forgotten = agent.memory.remove(query);
			if (!forgotten) {
				return {
					error: 'Failed to forget: Search is likely failed.',
				};
			}
			await agent.memory.save();
			return {
				result: 'Forgotten.',
			};
		} catch (err) {
			return {
				error: `Failed to forget: ${err instanceof Error ? err.message : err}`,
			};
		}
	},
});

export const memoryStatus = Agent.function({
	description:
		'Check current memory status - lists all memorized facts and shows how many characters are used out of the total limit.',
	params: {
		type: 'object',
		properties: {},
	},
	handler: async (_, agent: Agent) => {
		const facts = agent.memory.list();
		return {
			facts,
			usage: `${agent.memory.length}/${agent.memory.lengthLimit} characters used`,
		};
	},
});
