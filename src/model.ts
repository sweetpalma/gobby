import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Mutex } from 'es-toolkit';
import {
	LlamaChatSession,
	LlamaLogLevel,
	ChatHistoryItem,
	GbnfJsonSchema,
	GbnfJsonSchemaToType,
	getLlama,
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
	signal?: AbortSignal;
	onFunctionCall?: (name: string, args: unknown) => void;
	onTextChunk?: (chunk: string) => void;
}

/**
 * Model Response.
 */
export interface ModelResponse {
	text: string;
}

/**
 * Model History.
 */
export type ModelHistory = Array<ChatHistoryItem>;

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
	public override name = 'ModelAbort';
	constructor(msg?: string) {
		super(msg ?? 'Model inference was aborted.');
	}
}

/**
 * Model Container.
 */
export class Model {
	private session: LlamaChatSession | null = null;
	private history: ModelHistory = [];
	private sessionMutex = new Mutex();

	/**
	 * @param opts.path - Model path.
	 * @param opts.cachePath - Startup cache path (optional).
	 * @param opts.functions - Model functions (optional).
	 * @param opts.systemPrompt - Model system prompt (optional).
	 * @param opts.temperature - Model temperature.
	 * @param opts.contextSize - Model context size.
	 */
	constructor(private opts: ModelOptions) {
		return;
	}

	/**
	 * Defines a new model function and returns it.
	 * @param fn.description - Function description (used by LLM).
	 * @param fn.params - Function parameters.
	 * @param fn.handler - Function handler.
	 */
	public static function<T extends ModelFunctionParamSchema>(fn: ModelFunction<T>) {
		return fn;
	}

	/**
	 * Model status.
	 */
	public get loaded() {
		return !!this.session;
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
		if (!this.session) {
			return;
		}
		const history = this.getHistory();
		const initialPrompt = history.find((item) => {
			return item.type === 'system';
		});
		if (initialPrompt) {
			initialPrompt.text = systemPrompt ?? '';
			this.setHistory(history);
		}
	}

	/**
	 * Gets current history.
	 * @returns History copy.
	 */
	public getHistory() {
		return structuredClone(this.history);
	}

	/**
	 * Sets current history.
	 * @returns History copy.
	 */
	public setHistory(history: ModelHistory) {
		this.history = structuredClone(history);
		this.session?.setChatHistory(structuredClone(history));
	}

	/**
	 * Loads model into the memory.
	 * @remarks Does nothing if session is already loaded.
	 */
	public async load() {
		await this.sessionMutex.acquire();
		try {
			if (this.session) {
				return;
			}
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
			this.session = new LlamaChatSession({
				contextSequence: context.getSequence(),
				systemPrompt: this.opts.systemPrompt,
			});
			if (this.history.length === 0) {
				this.history = structuredClone(this.session.getChatHistory());
			} else {
				this.session.setChatHistory(this.history);
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
	 * @remarks Disposed model retains chat history, so it could be resumed after calling the `load` method.
	 */
	public async dispose() {
		await this.sessionMutex.acquire();
		try {
			if (!this.session) {
				return;
			}
			// Dependant objects are also disposed:
			// https://node-llama-cpp.withcat.ai/guide/objects-lifecycle#llama-instances
			await this.session.model.llama.dispose();
			this.session = null;
		} finally {
			this.sessionMutex.release();
		}
	}

	/**
	 * Prompts model.
	 * @remarks Loads model if it's not ready yet.
	 * @param prompt.text - Prompt text.
	 * @param prompt.signal - Abort signal for prompt processing.
	 * @param prompt.onFunctionCall - Handler for function calling streaming.
	 * @param prompt.onTextChunk - Handler for text chunk streaming.
	 * @returns Model response.
	 */
	public async prompt(prompt: ModelPrompt) {
		const waitForAbortSignal = async (): Promise<never> => {
			if (prompt.signal?.aborted) {
				throw new ModelAbort();
			}
			return new Promise((_, reject) => {
				const abortHandler = () => reject(new ModelAbort());
				prompt.signal?.addEventListener('abort', abortHandler, { once: true });
			});
		};
		const infer = async (session: LlamaChatSession): Promise<ModelResponse> => {
			try {
				let functionName = '';
				let functionArgs = '';
				let textBuffer = '';
				await session.prompt(prompt.text, {
					functions: this.opts.functions,
					temperature: this.opts.temperature ?? 0.25,
					signal: prompt.signal,
					stopOnAbortSignal: true,
					onFunctionCallParamsChunk: (chunk) => {
						if (functionName.length === 0) {
							functionName = chunk.functionName;
						}
						functionArgs = functionArgs + chunk.paramsChunk;
						if (chunk.done) {
							prompt.onFunctionCall?.(functionName, JSON.parse(functionArgs));
							functionName = '';
							functionArgs = '';
						}
					},
					onTextChunk: (chunk) => {
						textBuffer = textBuffer + chunk;
						prompt.onTextChunk?.(chunk);
					},
				});
				return {
					text: textBuffer,
				};
			} catch (err) {
				const message = err instanceof Error ? err.message : `${err}`;
				session.setChatHistory([
					...session.getChatHistory(),
					{
						type: 'system',
						text: `An error occurred: ${message}`,
					},
				]);
				throw err;
			} finally {
				this.setHistory(session.getChatHistory());
			}
		};
		if (!this.session) {
			await this.load();
		}
		await this.sessionMutex.acquire();
		try {
			return await Promise.race([infer(this.session!), waitForAbortSignal()]);
		} finally {
			this.sessionMutex.release();
		}
	}

	/**
	 * Tries to load a startup cache or creates a new if it's corrupt or missing.
	 * @remarks Implementing this method sped up the loading time by 5x on average.
	 * @param cachePath - Cache folder path.
	 */
	private async useStartupCache(cachePath: string) {
		if (!this.session) {
			return;
		}
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
