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
			agent.memory.add(fact);
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
		'Forget a previously memorized fact about the user. Use this when the user asks you to forget something, or when a fact is no longer accurate. If you are unsure about the exact wording, use memoryStatus first to find it.',
	params: {
		type: 'object',
		required: ['query'],
		properties: {
			query: {
				type: 'string',
				description:
					'A specific search query to match the fact to forget. It must match exactly one fact to succeed.',
			},
		},
	},
	handler: async ({ query }, agent: Agent) => {
		try {
			agent.memory.remove(query);
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
