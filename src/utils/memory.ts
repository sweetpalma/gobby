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
	lengthLimit?: number;
}

/**
 * Memory Error.
 */
export class MemoryError extends Error {
	public override name: string = 'MemoryError';
}

/**
 * Memory Container.
 * @remarks Stores a list of facts as a YAML file.
 */
export class Memory {
	private readonly path: string;
	private facts: Array<string> = [];

	constructor({ path, lengthLimit }: MemoryOptions) {
		this.path = path;
		this.lengthLimit = lengthLimit ?? 4096;
	}

	/**
	 * Memory length limit.
	 */
	public lengthLimit: number;

	/**
	 * Memory size in characters.
	 */
	public get length() {
		return this.format().length;
	}

	/**
	 * Adds a new fact, skipping exact duplicates.
	 * Throws an error if the fact is too big to remember.
	 */
	public add(fact: string) {
		const trimmed = fact.trim();
		if (trimmed.length === 0) {
			throw new MemoryError('Fact is empty.');
		}
		if (this.facts.includes(trimmed)) {
			return;
		}
		this.facts.push(trimmed);
		if (this.length > this.lengthLimit) {
			this.facts.pop();
			throw new MemoryError('Fact is too big to remember.');
		}
	}

	/**
	 * Removes a fact matching a query (case-insensitive substring).
	 * Throws an error if there are multiple matches or no matches at all.
	 */
	public remove(query: string) {
		const trimmed = query.trim();
		if (trimmed.length === 0) {
			throw new TypeError('Search query cannot be empty.');
		}
		const lower = trimmed.toLowerCase();
		const matches = this.facts.filter((fact) => {
			return fact.toLowerCase().includes(lower);
		});
		if (matches.length === 0) {
			throw new MemoryError(`No facts matched the query "${query}".`);
		}
		if (matches.length > 1) {
			throw new MemoryError(
				`The query "${query}" matched multiple facts. Please be more specific.`,
			);
		}
		const index = this.facts.indexOf(matches[0]!);
		this.facts.splice(index, 1);
	}

	/**
	 * Resets memory.
	 */
	public reset() {
		this.facts = [];
	}

	/**
	 * Returns a copy of all stored facts.
	 */
	public list() {
		return structuredClone(this.facts);
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
