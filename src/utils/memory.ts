import { dirname } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import stringComparison from 'string-comparison';
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
	similarityThreshold?: number;
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
 */
export class Memory {
	private facts: Array<string> = [];
	private similarityThreshold: number;
	private path: string;

	/**
	 * @param opts.path - Memory storage path.
	 * @param opts.similarityThreshold - Deduplication similarity threshold.
	 * @param opts.lengthLimit - Memory limit in charachters.
	 */
	constructor(opts: MemoryOptions) {
		this.path = opts.path;
		this.similarityThreshold = opts.similarityThreshold ?? 0.8;
		this.lengthLimit = opts.lengthLimit ?? 4096;
	}

	/**
	 * Memory limit in characters.
	 */
	public lengthLimit: number;

	/**
	 * Current memory size in charachters.
	 */
	public get length() {
		return this.format().length;
	}

	/**
	 * Gets a copy of all stored facts.
	 */
	public list() {
		return structuredClone(this.facts);
	}

	/**
	 * Formats known facts into a string and returns it.
	 * @returns Formatted string, or an empty string if no facts are present.
	 */
	public format() {
		const lines = this.facts.map((f) => `- ${f}`);
		return lines.join('\n');
	}

	/**
	 * Resets memory.
	 */
	public reset() {
		this.facts = [];
	}

	/**
	 * Adds a new fact.
	 * @remarks Throws an error if the fact is an empty string or is too big to remember.
	 * @param fact - Fact to add.
	 */
	public add(fact: string) {
		const rollbackState = structuredClone(this.facts);
		try {
			const text = fact.trim();
			if (text.length === 0) {
				throw new MemoryError('Fact is an empty string.');
			}
			this.facts = this.facts.filter((existing) => {
				const similarity = stringComparison.diceCoefficient.similarity(existing, text);
				return similarity < this.similarityThreshold;
			});
			this.facts.push(text);
			if (this.length > this.lengthLimit) {
				throw new MemoryError('Fact is too big to remember.');
			}
		} catch (err) {
			this.facts = rollbackState;
			throw err;
		}
	}

	/**
	 * Removes a fact matching a query (string similarity).
	 * @remarks Throws an error if there are multiple matches or no matches at all.
	 * @param query - Search query.
	 */
	public remove(query: string) {
		const rollbackState = structuredClone(this.facts);
		try {
			const text = query.trim();
			if (text.length === 0) {
				throw new TypeError('Search query cannot be empty.');
			}
			const matches = this.facts.filter((existing) => {
				const similarity = stringComparison.diceCoefficient.similarity(existing, text);
				return similarity >= this.similarityThreshold;
			});
			if (matches.length === 0) {
				throw new MemoryError(`No facts matched the query "${query}".`);
			}
			if (matches.length > 1) {
				throw new MemoryError(
					`The query "${query}" matched multiple facts. Please be more specific.`,
				);
			}
			const matchIndex = this.facts.indexOf(matches[0]);
			this.facts.splice(matchIndex, 1);
		} catch (err) {
			this.facts = rollbackState;
			throw err;
		}
	}

	/**
	 * Updates a fact matching a query (string similarity).
	 * @param query - Search query.
	 * @param fact - Fact to upsert.
	 */
	public update(query: string, fact: string) {
		const rollbackState = structuredClone(this.facts);
		try {
			this.remove(query);
			this.add(fact);
		} catch (err) {
			this.facts = rollbackState;
			throw err;
		}
	}

	/**
	 * Loads facts from disk.
	 * @remarks Does nothing if memory file does not exist.
	 */
	public async load() {
		const str = await readFile(this.path, 'utf-8').catch(() => {
			return null;
		});
		if (!str) {
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
	 * Saves facts to disk.
	 */
	public async save() {
		await mkdir(dirname(this.path), { recursive: true });
		await writeFile(this.path, yml.stringify(this.facts));
	}
}
