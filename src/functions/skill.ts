import { pick } from 'es-toolkit';
import { Agent } from '../agent';

export const skillList = Agent.function({
	description:
		'List all available skills. A skill is a reusable set of instructions for a common task (e.g. creating a git commit, reviewing code).',
	params: {
		type: 'object',
		properties: {},
	},
	handler: async (_, agent) => {
		try {
			const skills = agent.skills.list();
			return {
				skills: skills.map((i) => pick(i, ['name', 'description'])),
			};
		} catch (err) {
			return {
				error: `Failed to list skills: ${err instanceof Error ? err.message : err}`,
			};
		}
	},
});

export const skillRead = Agent.function({
	description:
		'Read the full instructions of a specific skill by name. Call this when you identify a relevant skill from your available skills to load its complete step-by-step instructions.',
	params: {
		type: 'object',
		properties: {
			name: {
				type: 'string',
				description: 'The name of the skill to read (as returned by "skillList").',
			},
		},
	},
	handler: async ({ name }, agent) => {
		try {
			const skills = agent.skills.list();
			const target = skills.find((entry) => {
				return name === entry.name;
			});
			if (target) {
				return pick(target, ['name', 'body']);
			} else {
				return {
					error: `Skill not found: ${name}`,
				};
			}
		} catch (err) {
			return {
				error: `Failed to read skill: ${err instanceof Error ? err.message : err}`,
			};
		}
	},
});
