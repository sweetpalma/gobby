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
} from './model';

/**
 * Model Function.
 * @remarks Mostly same as Model Function, but carries an agent reference as a second parameter.
 * @typeParam P - Handler params.
 * @typeParam R - Handler return type.
 */
export interface AgentFunction<P extends ModelFunctionParamSchema = any, R = any> {
	description: string;
	params: P;
	handler: (params: ModelFunctionParamSchemaToType<P>, agent: Agent) => R;
}

/**
 * Agent Options.
 */
export interface AgentOptions {
	config: Config;
	functions: Record<string, AgentFunction>;
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
	private loadedModel?: Model;
	private functions?: Record<string, AgentFunction>;
	private idleTimer?: ReturnType<typeof setTimeout>;

	/**
	 * @param opts.config Agent config container.
	 * @param opts.functions Agent functions (tools).
	 */
	constructor(opts: AgentOptions) {
		super();
		this.functions = opts.functions;
		this.config = opts.config;
		this.logger = new Logger({
			path: this.config.logsPath,
		});
		this.attachLogger();
		this.memory = new Memory({
			path: this.config.memoryPath,
			lengthLimit: this.config.get('memorySize'),
		});
	}

	/**
	 * Defines a new agent function and returns it.
	 */
	public static function<P extends ModelFunctionParamSchema, R>(fn: AgentFunction<P, R>) {
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
	 * Agent loaded model status.
	 */
	public get loaded() {
		return !!this.loadedModel?.loaded;
	}

	/**
	 * Agent loaded model.
	 * @remarks Throws Reference error if model is not loaded.
	 */
	public get model() {
		if (!this.loadedModel || !this.loadedModel.loaded) {
			throw new ReferenceError('Model is not loaded.');
		} else {
			return this.loadedModel;
		}
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
		this.loadedModel = new Model({
			path,
			systemPrompt: this.systemPrompt,
			cachePath: this.config.cachePath,
			temperature: this.config.get('temperature'),
			contextSize: this.config.get('contextSize'),
			functions: this.getFunctionsWithContext(),
		});
		await this.loadedModel.load();
		this.emit('loadComplete');
		this.resetIdleTimer();
	}

	/**
	 * Disposes the agent model.
	 */
	public async dispose() {
		this.clearIdleTimer();
		if (this.loadedModel) {
			await this.loadedModel.dispose();
		}
	}

	/**
	 * Prompts agent model.
	 * @remarks Loads model if it's not ready yet.
	 * @param prompt.text - Prompt text.
	 * @param prompt.signal - Abort signal for prompt processing.
	 * @param prompt.onFunctionCall - Handler for function calling streaming.
	 * @param prompt.onTextChunk - Handler for text chunk streaming.
	 * @returns Model response.
	 */
	public async prompt(prompt: ModelPrompt) {
		this.clearIdleTimer();
		try {
			if (this.loadedModel && !this.loadedModel.loaded) {
				this.emit('idleReload');
				await this.loadedModel.load();
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
	 * @remarks Auto-approves if no listener is registered.
	 * @param message - The message to display to the user.
	 * @returns True if the user confirmed, false otherwise.
	 */
	public async confirm(message: string) {
		if (this.listenerCount('confirm') === 0) {
			return true;
		}
		return new Promise<boolean>((resolve) => {
			this.emit('confirm', message, resolve);
		});
	}

	/**
	 * Gets agent functions, bound to the current instance.
	 * @private
	 */
	private getFunctionsWithContext() {
		if (!this.functions) {
			return {};
		}
		return mapValues(this.functions, (fn) => {
			return Model.function({
				...fn,
				handler: (params) => fn.handler(params, this),
			});
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
			if (!this.loadedModel?.loaded) {
				return;
			}
			try {
				this.emit('idle');
				await this.loadedModel.dispose();
			} catch (err) {
				this.emit('idleError', err);
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
			this.idleTimer = undefined;
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
