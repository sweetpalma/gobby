import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { outdent } from 'outdent';
import { fs, vol } from 'memfs';
import { SkillManager } from './skill';

vi.mock('node:fs/promises', () => fs.promises);
vi.mock('node:fs', () => fs);

describe('SkillManager', () => {
	const skillDirectory = '/workspace/.agents/skills/';
	const skillPath = join(skillDirectory, 'my-skill', 'SKILL.md');
	const manager = new SkillManager();

	beforeEach(() => {
		vol.reset();
		manager.reset();
	});

	it('loads a valid skill', async () => {
		vol.fromJSON({
			[skillPath]: outdent`
				---
				name: my-skill
				description: Does something useful.
				---
				## Instructions
				Do the thing.
			`,
		});
		await manager.loadSkill(skillPath);
		expect(manager.list()).toMatchObject([
			{
				name: 'my-skill',
				description: 'Does something useful.',
				body: expect.stringContaining('Do the thing.'),
			},
		]);
	});

	it('loads a skill with no body content', async () => {
		vol.fromJSON({
			[skillPath]: outdent`
				---
				name: my-skill
				description: Does something useful.
				---
			`,
		});
		await manager.loadSkill(skillPath);
		expect(manager.list()).toMatchObject([
			{
				name: 'my-skill',
				description: 'Does something useful.',
				body: '',
			},
		]);
	});

	it('loads a valid skill directory', async () => {
		vol.fromJSON({
			[join(skillDirectory, 'my-skill-a', 'SKILL.md')]: outdent`
				---
				name: my-skill-a
				description: Does something useful.
				---
			`,
			[join(skillDirectory, 'my-skill-b', 'SKILL.md')]: outdent`
				---
				name: my-skill-b
				description: Does something useful.
				---
			`,
			[join(skillDirectory, 'just-random-directory', 'README.md')]: outdent`
				Just some file. Will be ignored.
			`,
		});
		await manager.loadDirectory(skillDirectory);
		expect(manager.length).toBe(2);
		expect(manager.list()).toMatchObject([
			{
				name: 'my-skill-a',
				description: 'Does something useful.',
				body: '',
			},
			{
				name: 'my-skill-b',
				description: 'Does something useful.',
				body: '',
			},
		]);
	});

	it('merges skills with the same name', async () => {
		vol.fromJSON({
			['/user-skills/my-skill/SKILL.md']: outdent`
				---
				name: my-skill
				description: Does something useful.
				---
			`,
			['/project-skills/my-skill/SKILL.md']: outdent`
				---
				name: my-skill
				description: Does something useful, but custom.
				---
			`,
		});
		await manager.loadDirectory('/user-skills/');
		await manager.loadDirectory('/project-skills/');
		expect(manager.length).toBe(1);
		expect(manager.list()).toMatchObject([
			{
				name: 'my-skill',
				description: 'Does something useful, but custom.',
				body: '',
			},
		]);
	});

	it('retains an error when directory contains invalid skill sub-directories', async () => {
		vol.fromJSON({
			[join(skillDirectory, 'my-skill-valid', 'SKILL.md')]: outdent`
				---
				name: my-skill-valid
				description: Does something useful.
				---
			`,
			[join(skillDirectory, 'my-skill-invalid', 'SKILL.md')]: outdent`
				---
				name: my-skill
				description: Fails because directory name mismatch.
				---
			`,
		});
		const { errors } = await manager.loadDirectory(skillDirectory);
		expect(manager.length).toBe(1);
		expect(manager.list()).toMatchObject([
			{
				name: 'my-skill-valid',
				description: 'Does something useful.',
				body: '',
			},
		]);
		expect(errors.length).toBe(1);
		expect(errors).toMatchObject([
			{
				message: expect.stringContaining('Skill name'),
			},
		]);
	});

	it('throws an error when metadata is missing', async () => {
		vol.fromJSON({
			[skillPath]: 'No frontmatter here.',
		});
		await expect(manager.loadSkill(skillPath)).rejects.toMatchObject({
			message: expect.stringContaining('Missing skill metadata:'),
		});
	});

	it('throws an error when name field is missing', async () => {
		vol.fromJSON({
			[skillPath]: outdent`
				---
				description: Does something useful.
				---
			`,
		});
		await expect(manager.loadSkill(skillPath)).rejects.toMatchObject({
			message: expect.stringContaining('Invalid skill metadata:'),
		});
	});

	it('throws an error when description field is missing', async () => {
		vol.fromJSON({
			[skillPath]: outdent`
				---
				name: my-skill
				---
			`,
		});
		await expect(manager.loadSkill(skillPath)).rejects.toMatchObject({
			message: expect.stringContaining('Invalid skill metadata:'),
		});
	});

	it('throws an error when metadata has invalid syntax', async () => {
		vol.fromJSON({
			[skillPath]: outdent`
				---
				name: my-skill
				description: Does something useful.
				': bad: yaml:',
				---
			`,
		});
		await expect(manager.loadSkill(skillPath)).rejects.toMatchObject({
			message: expect.stringContaining('Implicit map keys'),
		});
	});
});
