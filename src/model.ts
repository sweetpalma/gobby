import { Writable } from 'node:stream';
import { Mutex } from 'es-toolkit';
import {
	getLlama,
	defineChatSessionFunction,
	LlamaChatSession,
	LlamaLogLevel,
	GbnfJsonSchema,
	GbnfJsonSchemaToType,
	ChatHistoryItem,
} from 'node-llama-cpp';

/**
 * Model Options.
 */
export interface ModelOptions {
	path: string;
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
	 * @remarks Loads model into the memory if it's not loaded already.
	 */
	public async prompt(prompt: ModelPrompt) {
		const waitForAbort = () => {
			return new Promise<never>((_, reject) => {
				const abort = () => {
					prompt.stream?.end();
					reject(new ModelAbort());
				};
				if (prompt.signal) {
					if (!prompt.signal.aborted) {
						prompt.signal.addEventListener('abort', abort, { once: true });
					} else {
						abort();
					}
				}
			});
		};
		const runInference = async (): Promise<ModelResponse> => {
			const session = this.session;
			const history = session.getChatHistory();
			try {
				let buffer = '';
				await session.prompt(prompt.text, {
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
				session.setChatHistory([
					...session.getChatHistory(),
					{
						type: 'system',
						text: `An error occurred: ${message}`,
					},
				]);
				throw err;
			} finally {
				if (prompt.skipHistory) {
					session.setChatHistory(history);
				}
			}
		};
		await this.sessionMutex.acquire();
		try {
			return await Promise.race([waitForAbort(), runInference()]);
		} finally {
			prompt.stream?.end();
			this.sessionMutex.release();
		}
	}
}
