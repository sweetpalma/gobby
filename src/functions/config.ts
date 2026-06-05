import { Agent } from '../agent';

export const configRead = Agent.function({
	description: 'Read the current agent configuration.',
	params: {
		type: 'object',
		properties: {},
	},
	handler: async (_, agent: Agent) => {
		try {
			return {
				modelRepo: agent.config.get('modelRepo'),
				modelPath: agent.config.get('modelPath'),
				contextSize: agent.config.get('contextSize'),
				memorySize: agent.config.get('memorySize'),
			};
		} catch (err) {
			return {
				error: `Failed to read config: ${err instanceof Error ? err.message : err}`,
			};
		}
	},
});

export const configWrite = Agent.function({
	description: 'Write or update the agent configuration options. Only provided options will be updated.',
	params: {
		type: 'object',
		properties: {
			contextSize: {
				type: 'number',
				description: 'The maximum context size for the model in tokens (e.g. 32000).',
			},
			memorySize: {
				type: 'number',
				description: 'The maximum size of persistent memory in characters (e.g. 4096).',
			},
		},
	},
	handler: async (params, agent: Agent) => {
		try {
			if (params.contextSize !== undefined) {
				agent.config.set('contextSize', params.contextSize);
			}
			if (params.memorySize !== undefined) {
				agent.config.set('memorySize', params.memorySize);
			}
			await agent.config.save();
			return {
				success: true,
			};
		} catch (err) {
			return {
				error: `Failed to write config: ${err instanceof Error ? err.message : err}`,
			};
		}
	},
});
