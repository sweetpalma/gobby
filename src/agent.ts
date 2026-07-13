import { EventEmitter } from 'node:events';
import { pick, mapValues } from 'es-toolkit';

import { downloadModel } from './utils/download';
import { Memory } from './utils/memory';
import { SYSTEM_PROMPT } from './prompts/system';
import { Logger } from './utils/logger';
import { Config } from './utils/config';
import {
	Model,
	ModelResponse,
	ModelPrompt,
	ModelAbort,
	ModelFunctionParamSchema,
	ModelFunctionParamSchemaToType,
	ModelFunction,
} from './model';

/**
 * Agent Function.
 * @remarks Semantically similar to {@link ModelFunction}, but carries an agent reference as a second function parameter.
 * @typeParam Parameters - Handler paramseters.
 * @typeParam ReturnType - Handler return type.
 */
export interface AgentFunction<
	Parameters extends ModelFunctionParamSchema = any,
	ReturnType = any,
> {
	description: string;
	params: Parameters;
	handler: (
		params: ModelFunctionParamSchemaToType<Parameters>,
		agent: Agent,
	) => ReturnType;
}

/**
 * Agent Options.
 */
export interface AgentOptions {
	config: Config;
	functions?: Record<string, AgentFunction>;
}

/**
 * Agent Events.
 */
export interface AgentEvents {
	download: [number];
	downloadProgress: [number];
	downloadComplete: [];
	init: [];
	load: [];
	loadComplete: [];
	idle: [];
	idleReload: [];
	idleError: [unknown];
	prompt: [ModelPrompt];
	promptComplete: [ModelPrompt, ModelResponse];
	promptError: [unknown];
	confirm: [string, (result: boolean) => void];
	function: [string, unknown];
}

/**
 * Agent Abort Signal.
 */
export const AgentAbort = ModelAbort;

/**
 * Agent Container.
 */
export class Agent extends EventEmitter<AgentEvents> {
	private model: Model | null = null;
	private idleTimer: ReturnType<typeof setTimeout> | null = null;
	private functions: Record<string, ModelFunction>;

	/**
	 * @param opts.config Agent config container.
	 * @param opts.functions Agent functions (tools).
	 */
	constructor(opts: AgentOptions) {
		super();
		this.config = opts.config;
		this.logger = new Logger({
			path: this.config.logsPath,
		});
		this.attachLogger();
		this.memory = new Memory({
			path: this.config.memoryPath,
			lengthLimit: this.config.get('memorySize'),
		});
		this.functions = mapValues(opts.functions ?? {}, (fn) => {
			return Model.function({
				...fn,
				handler: (params) => fn.handler(params, this),
			});
		});
	}

	/**
	 * Defines a new agent function and returns it.
	 * @param fn.description - Function description (used by LLM).
	 * @param fn.params - Function parameters.
	 * @param fn.handler - Function handler.
	 */
	public static function<Parameters extends ModelFunctionParamSchema, ReturnType>(
		fn: AgentFunction<Parameters, ReturnType>,
	) {
		return fn;
	}

	/**
	 * Agent memory.
	 */
	public readonly memory: Memory;

	/**
	 * Agent config.
	 */
	public readonly config: Config;

	/**
	 * Agent logger.
	 */
	public readonly logger: Logger;

	/**
	 * Agent model status.
	 */
	public get loaded() {
		return this.model && this.model.loaded;
	}

	/**
	 * Agent system prompt.
	 */
	public get systemPrompt() {
		if (this.memory.length === 0) {
			return SYSTEM_PROMPT;
		}
		const memory = '\nYou remember the following:\n' + this.memory.format();
		return (SYSTEM_PROMPT + memory).trim();
	}

	/**
	 * Resets agent memory and conversation history without unloading the model.
	 * @remarks Useful for E2E testing routines.
	 * @internal
	 */
	public reset() {
		this.memory.reset();
		if (this.model) {
			this.model.systemPrompt = this.systemPrompt;
			this.model.resetHistory();
		}
	}

	/**
	 * Downloads and loads the agent model.
	 */
	public async load() {
		if (this.loaded) {
			return;
		}
		if (!(await this.config.exists())) {
			await this.config.save();
		}
		await this.config.load();
		await this.memory.load();
		this.memory.lengthLimit = this.config.get('memorySize');
		this.emit('init');
		const path = await downloadModel({
			outputDir: this.config.modelsPath,
			repo: this.config.get('modelRepo'),
			path: this.config.get('modelPath'),
			onDownload: (pct) => this.emit('download', pct),
			onProgress: (pct) => this.emit('downloadProgress', pct),
			onComplete: () => this.emit('downloadComplete'),
		});
		this.emit('load');
		this.model = new Model({
			path,
			systemPrompt: this.systemPrompt,
			temperature: this.config.get('temperature'),
			contextSize: this.config.get('contextSize'),
			functions: this.functions,
		});
		await this.model.load();
		await this.model.loadCache(this.config.cachePath);
		this.emit('loadComplete');
		this.resetIdleTimer();
	}

	/**
	 * Disposes of loaded resources.
	 * @remarks Chat history is retained and it may be continued later.
	 */
	public async dispose() {
		this.clearIdleTimer();
		if (this.model) {
			await this.model.dispose();
		}
	}

	/**
	 * Prompts agent model.
	 * @param prompt.text - Prompt text.
	 * @param prompt.signal - Abort signal for prompt processing.
	 * @param prompt.onFunctionCall - Handler for function calling streaming.
	 * @param prompt.onTextChunk - Handler for text chunk streaming.
	 * @returns Model response.
	 */
	public async prompt(prompt: ModelPrompt) {
		this.clearIdleTimer();
		try {
			if (!this.model) {
				throw new ReferenceError('Agent was not initialised.');
			}
			if (!this.model.loaded) {
				this.emit('idleReload');
				await this.model.load();
				await this.model.loadCache(this.config.cachePath);
			}
			this.emit('prompt', prompt);
			this.model.systemPrompt = this.systemPrompt;
			const response = await this.model.prompt({
				...prompt,
				onFunctionCall: (name, args) => {
					prompt.onFunctionCall?.(name, args);
					this.emit('function', name, args);
				},
			});
			this.emit('promptComplete', prompt, response);
			return response;
		} catch (err) {
			this.emit('promptError', err);
			throw err;
		} finally {
			this.resetIdleTimer();
		}
	}

	/**
	 * Requests user confirmation via the UI layer.
	 * @remarks Throws and error if no listeners are registered.
	 * @param message - The message to display to the user.
	 * @returns True if the user confirmed, false otherwise.
	 */
	public async confirm(message: string) {
		if (this.listenerCount('confirm') === 0) {
			throw new Error('Agent confirmation handler is not registered.');
		}
		return new Promise<boolean>((resolve) => {
			this.emit('confirm', message, resolve);
		});
	}

	/**
	 * Resets the idle timer. When it fires, the model is disposed to free memory.
	 * @private
	 */
	private resetIdleTimer() {
		this.clearIdleTimer();
		const millisecondTimeout = this.config.get('idleTimeout') * 1000;
		if (millisecondTimeout <= 0) {
			return;
		}
		this.idleTimer = setTimeout(async () => {
			if (this.model && this.model.loaded) {
				try {
					this.emit('idle');
					await this.model.dispose();
				} catch (err) {
					this.emit('idleError', err);
				}
			}
		}, millisecondTimeout);
		this.idleTimer.unref();
	}

	/**
	 * Clears the idle timer.
	 * @private
	 */
	private clearIdleTimer() {
		if (this.idleTimer) {
			clearTimeout(this.idleTimer);
			this.idleTimer = null;
		}
	}

	/**
	 * Attaches system logger.
	 * @private
	 */
	private attachLogger() {
		this.on('init', () => {
			this.logger.info('Initializing agent...');
		});
		this.on('download', () => {
			this.logger.info('Agent model is not found, downloading...');
		});
		this.on('downloadComplete', () => {
			this.logger.info('Agent model downloaded.');
		});
		this.on('idle', () => {
			this.logger.info('Model is idling, unloading...');
		});
		this.on('idleReload', () => {
			this.logger.info('Model is not idling anymore, loading...');
		});
		this.on('idleError', (error) => {
			this.logger.error('Failed to dispose idle model.', { error });
		});
		this.on('load', () => {
			this.logger.info('Agent model is found, loading...');
		});
		this.on('loadComplete', () => {
			this.logger.info('Agent model was successfully loaded.', {
				systemPrompt: this.systemPrompt,
			});
		});
		this.on('prompt', (data) => {
			this.logger.info('Model request.', {
				data: pick(data, ['text']),
			});
		});
		this.on('promptError', (error) => {
			this.logger.error('Model error.', { error });
		});
		this.on('promptComplete', (_, data) => {
			this.logger.info('Model response.', {
				data: pick(data, ['text']),
			});
		});
		this.on('function', (functionName, functionArgs) => {
			this.logger.info('Function call.', {
				functionName,
				functionArgs,
			});
		});
	}
}
