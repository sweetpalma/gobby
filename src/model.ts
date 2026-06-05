import { Writable } from 'node:stream';
import {
	getLlama,
	defineChatSessionFunction,
	Llama,
	LlamaChatSession,
	GbnfJsonSchema,
	GbnfJsonSchemaToType,
	LlamaModel,
	LlamaContext,
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
	private static llama?: Llama;
	private context?: LlamaContext;
	private session?: LlamaChatSession;
	private model?: LlamaModel;

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
	 * Loads model into the memory.
	 */
	public async load() {
		const llama = await this.getLlama();
		this.model = await llama.loadModel({
			modelPath: this.opts.path,
		});
		this.context = await this.model.createContext({
			contextSize: this.opts.contextSize,
			flashAttention: true,
		});
		this.session = new LlamaChatSession({
			contextSequence: this.context.getSequence(),
			systemPrompt: this.opts.systemPrompt,
		});
	}

	/**
	 * Disposes resources.
	 */
	public async dispose() {
		if (this.session) {
			this.session.dispose();
		}
		if (this.context) {
			await this.context.dispose();
		}
		if (this.model) {
			await this.model.dispose();
		}
	}

	/**
	 * Prompts loaded model.
	 * @remarks Loads model into the memory if it's not loaded already.
	 */
	public async prompt(prompt: ModelPrompt) {
		const session = await this.getSession();
		const waitForAbort = () => {
			return new Promise<never>((_, reject) => {
				const signal = prompt.signal;
				if (!signal) {
					return;
				}
				const existingHandler = signal.onabort;
				signal.onabort = (event) => {
					existingHandler?.call(signal, event);
					prompt.stream?.end();
					reject(new ModelAbort());
				};
			});
		};
		const runInference = async (): Promise<ModelResponse> => {
			try {
				let buffer = '';
				await session.prompt(prompt.text, {
					functions: this.opts.functions,
					temperature: this.opts.temperature ?? 0.25,
					signal: prompt.signal,
					stopOnAbortSignal: true,
					onTextChunk: (chunk) => {
						if (prompt.stream) {
							if (buffer.length === 0 && chunk.trim().length === 0) {
								return; // trim beginning
							} else if (/\s\s\s$/i.test(buffer + chunk)) {
								return; // trim empty lines
							} else {
								prompt.stream.write(chunk);
								buffer = buffer + chunk;
							}
						}
					},
				});
				return {
					text: buffer,
				};
			} catch (err) {
				const history = session.getChatHistory();
				const message = err instanceof Error ? err.message : `${err}`;
				history.push({
					type: 'system',
					text: `An error occurred: ${message}`,
				});
				session.setChatHistory(history);
				throw err;
			}
		};
		try {
			return await Promise.race([waitForAbort(), runInference()]);
		} finally {
			prompt.stream?.end();
		}
	}

	/**
	 * Gets an active LLAMA instance or create a new.
	 * @private
	 */
	private async getLlama() {
		if (!Model.llama) {
			process.env.GGML_METAL_NO_RESIDENCY = '1';
			Model.llama = await getLlama();
		}
		return Model.llama!;
	}

	/**
	 * Gets an active model session or creates a new.
	 * @private
	 */
	private async getSession() {
		if (!this.session) {
			await this.load();
		}
		return this.session!;
	}
}
