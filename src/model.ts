import { PassThrough, Writable } from 'node:stream';
import {
	getLlama,
	Llama,
	LlamaChatSession,
	ChatSessionModelFunctions,
} from 'node-llama-cpp';

/**
 * Model Container Options.
 */
export interface ModelOptions {
	path: string;
	functions?: ModelFunctions;
	systemPrompt?: string;
	temperature?: number;
	contextSize?: number;
}

/**
 * Model Container Functions.
 */
export type ModelFunctions = ChatSessionModelFunctions;

/**
 * Model Container Response.
 */
export interface ModelResponse {
	text: string;
}

/**
 * Model Container.
 */
export class Model {
	private static llama?: Llama;
	private session?: LlamaChatSession;

	constructor(private opts: ModelOptions) {
		return;
	}

	/**
	 * Loads model into the memory.
	 */
	public async load() {
		const llama = await this.getLlama();
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
	}

	/**
	 * Prompts loaded model.
	 * @remarks Loads model into the memory if it's not loaded already.
	 */
	public async prompt(
		text: string,
		stream?: Writable,
		signal?: AbortSignal,
	): Promise<ModelResponse> {
		let buffer = '';
		try {
			const session = await this.getSession();
			try {
				await session.prompt(text, {
					signal,
					stopOnAbortSignal: true,
					functions: this.opts.functions,
					temperature: this.opts.temperature ?? 0.25,
					onTextChunk: (chunk) => {
						if (stream) {
							if (buffer.length === 0 && chunk.trim().length === 0) {
								return; // trim beginning
							} else if (/\s\s\s$/i.test(buffer + chunk)) {
								return; // trim empty lines
							} else {
								buffer = buffer + chunk;
								stream.write(chunk);
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
					text: `An error occured: ${message}`,
				});
				session.setChatHistory(history);
				throw err;
			}
		} finally {
			if (stream) {
				stream.end();
			}
		}
	}

	/**
	 * Gets an active LLAMA instance or create a new.
	 * @private
	 */
	private async getLlama() {
		if (!Model.llama) {
			Model.llama = await getLlama();
		}
		return Model.llama!;
	}

	/**
	 * Gets an active model session or createsa  new.
	 * @private
	 */
	private async getSession() {
		if (!this.session) {
			await this.load();
		}
		return this.session!;
	}
}
