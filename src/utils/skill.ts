import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import yml from 'yaml';
import zod from 'zod';

/**
 * Skill Frontmatter Schema.
 */
export const SkillFrontmatterSchema = zod.object({
	name: zod
		.string()
		.max(64, 'Name must be at most 64 characters.')
		.min(1, 'Name must not be empty.')
		.regex(
			/^[a-z0-9](?:[a-z0-9]|-(?!-))*[a-z0-9]$|^[a-z0-9]$/,
			'Invalid skill name format.',
		),
	description: zod
		.string()
		.max(1024, 'Description must be at most 1024 characters.')
		.min(1, 'Description must not be empty.'),
});

/**
 * Skill Schema.
 */
export const SkillSchema = SkillFrontmatterSchema.extend({
	location: zod.string(),
	body: zod.string(),
});

/**
 * Skill Schema Type.
 */
export type Skill = zod.infer<typeof SkillSchema>;

/**
 * Skill Manager Options.
 */
export interface SkillManagerOptions {
	skills?: Array<Skill>;
}

/**
 * Skill Error.
 */
export class SkillError extends Error {
	public override name = 'SkillError';
}

/**
 * Skill Manager.
 */
export class SkillManager {
	private skills: Array<Skill>;

	constructor(opts: SkillManagerOptions = {}) {
		this.skills = opts.skills ?? [];
	}

	/**
	 * Skill count.
	 */
	public get length() {
		return this.skills.length;
	}

	/**
	 * Lists loaded skills.
	 * @returns Skill list.
	 */
	public list() {
		return structuredClone(this.skills);
	}

	/**
	 * Formats known facts into a readable string and returns it.
	 * @remarks This only includes names and descriptions, without body and other fields.
	 * @returns Formatted skills.
	 */
	public format() {
		const lines = this.skills.map((i) => `- ${i.name}: ${i.description}`);
		return lines.join('\n');
	}

	/**
	 * Resets known skills.
	 */
	public reset() {
		this.skills = [];
	}

	/**
	 * Adds skill to the registry.
	 * @param skill - Skill to add.
	 */
	public add(skill: Skill) {
		this.skills = this.merge([...this.skills, skill]);
	}

	/**
	 * Removes skill from the registry.
	 */
	public remove(name: string) {
		this.skills = this.skills.filter((skill) => {
			return skill.name !== name;
		});
	}

	/**
	 * Loads the skill from disk and adds it to the registry.
	 * @param location - Absolute path to the skill file.
	 * @returns Loaded skill.
	 */
	public async loadSkill(location: string) {
		const skill = await this.readSkill(location);
		this.add(skill);
		return skill;
	}

	/**
	 * Loads the skill from directory and adds it to the registry.
	 * @param location - Absolute path to the skill directory.
	 * @returns List of skills and encountered errors.
	 */
	public async loadDirectory(location: string) {
		const loaded = await this.readDirectory(location);
		this.skills = this.merge([...this.skills, ...loaded.skills]);
		return loaded;
	}

	/**
	 * Reads the skill from disk and returns it.
	 * @remarks Does not add the skill to the registry (use {@link loadSkill} instead).
	 * @param location - Absolute path to the skill file.
	 * @returns Skill.
	 */
	public async readSkill(location: string) {
		const content = await readFile(location, 'utf-8').catch(() => {
			return null;
		});
		if (!content) {
			throw new SkillError(`Could not read skill file: ${location}`);
		} else {
			return this.parse(location, content);
		}
	}

	/**
	 * Reads the skill directory and returns its contents.
	 * @remarks Does not add the skill to the registry (use {@link loadDirectory} instead).
	 * @param location - Absolute path to the skill directory.
	 * @returns List of skills and encountered errors.
	 */
	public async readDirectory(location: string) {
		const entries = await readdir(location).catch(() => {
			return [];
		});
		const skills: Array<Skill> = [];
		const errors: Array<Error> = [];
		for (const entry of entries) {
			try {
				const skillLocation = join(location, entry, 'SKILL.md');
				const skillStats = await stat(skillLocation).catch(() => {
					return null;
				});
				if (!skillStats) {
					continue;
				}
				const skill = await this.readSkill(skillLocation);
				if (skill.name === entry) {
					skills.push(skill);
				} else {
					const msg = `Skill name "${skill.name}" must match directory name "${entry}".`;
					throw new SkillError(msg);
				}
			} catch (err) {
				errors.push(err as Error);
			}
		}
		return {
			errors,
			skills: this.merge(skills),
		};
	}

	/**
	 * Merges skills with same names.
	 * @remarks Latter skills overwrite earlier.
	 * @param skills - Skill list.
	 * @returns Merged skills.
	 */
	private merge(skills: Array<Skill>) {
		const mapped = skills.reduce((m, x) => m.set(x.name, x), new Map<string, Skill>());
		return Array.from(mapped.values());
	}

	/**
	 * Parses skill and returns it.
	 * @param location - Skill location.
	 * @param source - Skill source.
	 * @returns Parsed skill.
	 */
	private parse(location: string, content: string) {
		const trimmed = content.trim();
		const matched = trimmed.match(
			/^\s*---\s*\r?\n(?<frontmatter>.*?)\r?\n\s*---\s*\r?\n?(?<body>.*)$/s,
		);
		if (!matched || !matched.groups) {
			throw new SkillError(`Missing skill metadata: ${location}.`);
		}
		const { frontmatter, body } = matched.groups;
		const { data, error } = SkillFrontmatterSchema.safeParse(yml.parse(frontmatter));
		if (!error) {
			const skill: Skill = { ...data, location, body };
			return skill;
		} else {
			const msg = `Invalid skill metadata:\n${zod.prettifyError(error)}`;
			throw new SkillError(msg);
		}
	}
}
