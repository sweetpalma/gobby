import { describe, it, expect, vi, beforeEach } from 'vitest';
import { skillList, skillRead } from './skill';
import { SkillManager } from '../utils/skill';
import { Agent } from '../agent';

const mockAgent = () => {
	const skills = new SkillManager();
	const agent: Partial<Agent> = { skills };
	return agent as Agent;
};

describe('Tools (Skill)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('skillList', () => {
		it('returns a list of available skills with name and description only', async () => {
			const agent = mockAgent();
			agent.skills.add({
				name: 'git-commit',
				description: 'Create a commit',
				location: '/path/to/SKILL.md',
				body: 'Long markdown body instructions',
			});
			agent.skills.add({
				name: 'roll-dice',
				description: 'Roll a die',
				location: '/path/to/dice/SKILL.md',
				body: 'echo $((RANDOM % 6 + 1))',
			});
			const result = await skillList.handler({}, agent);
			expect(result).toEqual({
				skills: [
					{ name: 'git-commit', description: 'Create a commit' },
					{ name: 'roll-dice', description: 'Roll a die' },
				],
			});
		});

		it('returns an empty list when no skills are registered', async () => {
			const agent = mockAgent();
			const result = await skillList.handler({}, agent);
			expect(result).toEqual({ skills: [] });
		});

		it('returns an error when listing skills fails', async () => {
			const agent = mockAgent();
			vi.spyOn(agent.skills, 'list').mockImplementation(() => {
				throw new Error('Something went wrong');
			});
			const result = await skillList.handler({}, agent);
			expect(result).toEqual({
				error: 'Failed to list skills: Something went wrong',
			});
		});
	});

	describe('skillRead', () => {
		it('returns the skill name and full body when found', async () => {
			const agent = mockAgent();
			agent.skills.add({
				name: 'git-commit',
				description: 'Create a commit',
				location: '/path/to/SKILL.md',
				body: 'Long markdown body instructions',
			});
			const result = await skillRead.handler({ name: 'git-commit' }, agent);
			expect(result).toEqual({
				name: 'git-commit',
				body: 'Long markdown body instructions',
			});
		});

		it('returns an error when the skill is not found', async () => {
			const agent = mockAgent();
			const result = await skillRead.handler({ name: 'non-existent' }, agent);
			expect(result).toEqual({
				error: 'Skill not found: non-existent',
			});
		});

		it('returns an error when reading the skill fails unexpectedly', async () => {
			const agent = mockAgent();
			vi.spyOn(agent.skills, 'list').mockImplementation(() => {
				throw new Error('Read failure');
			});
			const result = await skillRead.handler({ name: 'git-commit' }, agent);
			expect(result).toEqual({
				error: 'Failed to read skill: Read failure',
			});
		});
	});
});
