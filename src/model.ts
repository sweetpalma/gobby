import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Writable } from 'node:stream';
import { Mutex } from 'es-toolkit';
import {
	getLlama,
	defineChatSessionFunction,
	LlamaChatSession,
	LlamaLogLevel,
	ChatHistoryItem,
	GbnfJsonSchema,
	GbnfJsonSchemaToType,
} from 'node-llama-cpp';

/**
 * Model Options.
 */
export interface ModelOptions {
	path: string;
	cachePath?: string;
	functions?: Record<string, ModelFunction>;
	systemPrompt?: string;
	temperature?: number;
	contextSize?: number;
}

/**
 * Model Request (Prompt).
 */
export interface ModelPrompt {
	text: string;
	skipHistory?: boolean;
	signal?: AbortSignal;
	stream?: Writable;
}

/**
 * Model Response.
 */
export interface ModelResponse {
	text: string;
}

/**
 * Model Function.
 * @remarks Parameters use GBNF JSON format schema.
 */
export interface ModelFunction<T extends ModelFunctionParamSchema = any> {
	description: string;
	params: T;
	handler: (params: ModelFunctionParamSchemaToType<T>) => unknown;
}

/**
 * Model Function Parameter Schema.
 * @remarks Parameters use GBNF JSON format schema.
 * @internal
 */
export type ModelFunctionParamSchema = GbnfJsonSchema;

/**
 * Model Function Parameter Schema Transformer.
 * @remarks Parameters use GBNF JSON format schema.
 * @internal
 */
export type ModelFunctionParamSchemaToType<T extends ModelFunctionParamSchema> =
	GbnfJsonSchemaToType<T>;

/**
 * Model Abort Signal.
 */
export class ModelAbort extends Error {
	constructor(msg?: string) {
		super(msg ?? 'Model inference was aborted.');
	}
}

/**
 * Model Container.
 */
export class Model {
	private loadedSession?: LlamaChatSession;
	private sessionHistory?: Array<ChatHistoryItem>;
	private sessionMutex = new Mutex();

	constructor(private opts: ModelOptions) {
		return;
	}

	/**
	 * Defines a new agent function and returns it.
	 */
	public static function(def: ModelFunction) {
		return defineChatSessionFunction(def) as ModelFunction;
	}

	/**
	 * Model status.
	 */
	public get loaded() {
		return !!this.loadedSession;
	}

	/**
	 * Model session.
	 * @remarks Throws ReferenceError if model is not loaded.
	 */
	public get session() {
		if (!this.loadedSession) {
			throw new ReferenceError('Session is not loaded.');
		} else {
			return this.loadedSession;
		}
	}

	/**
	 * Model System Prompt.
	 */
	public get systemPrompt() {
		return this.opts.systemPrompt;
	}

	/**
	 * Model System Prompt.
	 */
	public set systemPrompt(systemPrompt: string | undefined) {
		this.opts.systemPrompt = systemPrompt;
		if (!this.loaded) {
			return;
		}
		this.session.setChatHistory(
			this.session.getChatHistory().map((item) => {
				if (item.type !== 'system') {
					return item;
				}
				return {
					...item,
					text: systemPrompt ?? '',
				};
			}),
		);
	}

	/**
	 * Loads model into the memory.
	 * @remarks Disposed model retains chat history, so it could be resumed after calling the `load` method.
	 */
	public async load() {
		await this.sessionMutex.acquire();
		try {
			const llama = await getLlama({
				logLevel: LlamaLogLevel.error,
			});
			const model = await llama.loadModel({
				modelPath: this.opts.path,
			});
			const context = await model.createContext({
				contextSize: this.opts.contextSize,
				flashAttention: true,
			});
			this.loadedSession = new LlamaChatSession({
				contextSequence: context.getSequence(),
				systemPrompt: this.opts.systemPrompt,
			});
			if (this.sessionHistory) {
				this.loadedSession.setChatHistory(this.sessionHistory);
			}
			if (this.opts.cachePath) {
				await this.useStartupCache(this.opts.cachePath);
			}
		} finally {
			this.sessionMutex.release();
		}
	}

	/**
	 * Disposes resources.
	 */
	public async dispose() {
		await this.sessionMutex.acquire();
		try {
			if (!this.loadedSession) {
				return;
			}
			// Dependant objects are also disposed:
			// https://node-llama-cpp.withcat.ai/guide/objects-lifecycle#llama-instances
			this.sessionHistory = this.session.getChatHistory();
			await this.loadedSession.model.llama.dispose();
			this.loadedSession = undefined;
		} finally {
			this.sessionMutex.release();
		}
	}

	/**
	 * Prompts loaded model.
	 */
	public async prompt(prompt: ModelPrompt) {
		const infer = async (): Promise<ModelResponse> => {
			const history = this.session.getChatHistory();
			try {
				let buffer = '';
				await this.session.prompt(prompt.text, {
					functions: this.opts.functions,
					temperature: this.opts.temperature ?? 0.25,
					signal: prompt.signal,
					stopOnAbortSignal: true,
					onTextChunk: (chunk) => {
						if (buffer.length === 0 && chunk.trim().length === 0) {
							return; // trim beginning
						} else if (/\s\s\s$/i.test(buffer + chunk)) {
							return; // trim empty lines
						} else {
							prompt.stream?.write(chunk);
							buffer = buffer + chunk;
						}
					},
				});
				return {
					text: buffer,
				};
			} catch (err) {
				const message = err instanceof Error ? err.message : `${err}`;
				this.session.setChatHistory([
					...this.session.getChatHistory(),
					{
						type: 'system',
						text: `An error occurred: ${message}`,
					},
				]);
				throw err;
			} finally {
				if (prompt.skipHistory) {
					this.session.setChatHistory(history);
				}
			}
		};
		const waitForAbortSignal = async (): Promise<never> => {
			if (prompt.signal?.aborted) {
				throw new ModelAbort();
			}
			return new Promise((_, reject) => {
				const abortHandler = () => reject(new ModelAbort());
				prompt.signal?.addEventListener('abort', abortHandler, { once: true });
			});
		};
		await this.sessionMutex.acquire();
		try {
			return await Promise.race([infer(), waitForAbortSignal()]);
		} finally {
			prompt.stream?.end();
			this.sessionMutex.release();
		}
	}

	/**
	 * Tries to load a startup cache or creates a new if it's corrupt or missing.
	 * @remarks Implementing this method sped up the loading time by 5x on average.
	 * @param cachePath - Cache folder path.
	 */
	private async useStartupCache(cachePath: string) {
		const hashSource = {
			systemPrompt: this.systemPrompt ?? null,
			functions: this.opts.functions ?? null,
		};
		const hashPath = join(cachePath, 'hash.txt');
		const dataPath = join(cachePath, 'data.bin');
		const savedHash = await readFile(hashPath, 'utf-8').catch(() => null);
		const freshHash = createHash('sha256')
			.update(JSON.stringify(hashSource))
			.digest('hex');
		try {
			if (savedHash !== freshHash) {
				throw new Error('System prompt changed, rebuilding...');
			}
			await this.session.sequence.loadStateFromFile(dataPath, { acceptRisk: true });
		} catch {
			// Changing model or context size would make loading throw and error.
			// That's completely expected, thus we could catch it and rebuild our cache.
			await mkdir(cachePath, { recursive: true });
			await this.session.preloadPrompt('', { functions: this.opts.functions });
			await this.session.sequence.saveStateToFile(dataPath);
			await writeFile(hashPath, freshHash);
		}
	}
}
