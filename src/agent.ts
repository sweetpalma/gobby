import { EventEmitter } from 'node:events';
import { mapValues } from 'es-toolkit';

import { downloadModel } from './utils/download';
import { Memory } from './utils/memory';
import { SYSTEM_PROMPT } from './prompts/system';
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
 * Agent Function.
 * @remarks Mostly same as Model Function, but carries an agent reference as a second parameter.
 */
export interface AgentFunction<T extends ModelFunctionParamSchema = any> {
	description: string;
	params: T;
	handler: (params: ModelFunctionParamSchemaToType<T>, agent: Agent) => unknown;
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
	load: [];
	loadComplete: [];
	idle: [];
	idleReload: [];
	prompt: [ModelPrompt];
	promptComplete: [ModelPrompt, ModelResponse];
}

/**
 * Agent Abort Signal.
 */
export const AgentAbort = ModelAbort;

/**
 * Agent Container.
 */
export class Agent extends EventEmitter<AgentEvents> {
	private functions?: Record<string, AgentFunction>;
	private loadedModel?: Model;
	private idleTimer?: ReturnType<typeof setTimeout>;

	constructor({ config, functions }: AgentOptions) {
		super();
		this.functions = functions;
		this.config = config;
		this.memory = new Memory({
			path: this.config.memoryPath,
			lengthLimit: this.config.get('memorySize'),
		});
	}

	/**
	 * Defines a new agent function and returns it.
	 */
	public static function<T extends ModelFunctionParamSchema>(def: AgentFunction<T>) {
		return def;
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
		if (!this.loadedModel) {
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
		const memoryPrompt = `\nThings you remember:\n${this.memory.format()}`;
		return SYSTEM_PROMPT + memoryPrompt;
	}

	/**
	 * Downloads and loads the agent model.
	 */
	public async load() {
		await this.config.load();
		await this.config.save();
		await this.memory.load();
		this.memory.lengthLimit = this.config.get('memorySize');
		this.emit('init');
		const path = await downloadModel({
			repo: this.config.get('modelRepo'),
			path: this.config.get('modelPath'),
			outputDir: this.config.modelsPath,
			onDownload: (pct) => this.emit('download', pct),
			onProgress: (pct) => this.emit('downloadProgress', pct),
			onComplete: () => this.emit('downloadComplete'),
		});
		this.emit('load');
		this.loadedModel = new Model({
			path,
			systemPrompt: this.systemPrompt,
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
			this.loadedModel = undefined;
		}
	}

	/**
	 * Prompts the agent.
	 * @param prompt - Target prompt.
	 * @returns Prompt result.
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
			const response = await this.model.prompt(prompt);
			this.emit('promptComplete', prompt, response);
			return response;
		} finally {
			this.resetIdleTimer();
		}
	}

	/**
	 * Gets agent functions, bound to the current instance.
	 * @private
	 */
	private getFunctionsWithContext() {
		return this.functions && mapValues(this.functions, (fn) => {
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
			if (this.loadedModel?.loaded) {
				try {
					await this.loadedModel.dispose();
					this.emit('idle');
				} catch {
					// Nothing ever happens, really.
					// chud.jpg
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
			this.idleTimer = undefined;
		}
	}
}
