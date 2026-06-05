import { dirname } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import yml from 'yaml';
import zod from 'zod';

/**
 * Memory Schema.
 * @internal
 */
export const MemorySchema = zod.array(zod.string());

/**
 * Memory Options.
 */
export interface MemoryOptions {
	path: string;
}

/**
 * Memory Container.
 * @remarks Stores a list of facts as a YAML file.
 */
export class Memory {
	private readonly path: string;
	private facts: Array<string> = [];

	constructor(opts: MemoryOptions) {
		this.path = opts.path;
	}

	/**
	 * Adds a new fact, skipping exact duplicates.
	 */
	public add(fact: string) {
		const trimmed = fact.trim();
		if (this.facts.includes(trimmed)) {
			return;
		}
		if (trimmed.length !== 0) {
			this.facts.push(trimmed);
		}
	}

	/**
	 * Removes the first fact matching a query (case-insensitive substring).
	 */
	public remove(query: string) {
		const lower = query.toLowerCase();
		const index = this.facts.findIndex((fact) => {
			return fact.toLowerCase().includes(lower);
		});
		if (index >= 0) {
			this.facts.splice(index, 1);
		}
	}

	/**
	 * Returns a copy of all stored facts.
	 */
	public list() {
		return [...this.facts];
	}

	/**
	 * Formats all facts for system prompt injection.
	 * @returns Formatted string, or empty string if no facts exist.
	 */
	public format() {
		if (this.facts.length === 0) {
			return '';
		}
		const lines = this.facts.map((f) => `- ${f}`);
		return lines.join('\n');
	}

	/**
 * Loads facts from file.
 */
	public async load() {
		let str: string;
		try {
			str = await readFile(this.path, 'utf-8');
		} catch {
			await this.save();
			return;
		}
		const { data, error } = MemorySchema.safeParse(yml.parse(str));
		if (!error) {
			this.facts = data;
		} else {
			const msg = zod.prettifyError(error);
			throw new Error(msg);
		}
	}

	/**
	 * Saves facts to file.
	 */
	public async save() {
		await mkdir(dirname(this.path), { recursive: true });
		await writeFile(this.path, yml.stringify(this.facts));
	}
}
