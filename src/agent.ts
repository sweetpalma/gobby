import { EventEmitter } from 'node:events';
import { downloadModel } from './utils/download';
import { SYSTEM_PROMPT } from './prompts/system';
import { Config } from './config';
import {
	Model,
	ModelFunction,
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

	constructor({ config, functions }: AgentOptions) {
		super();
		this.functions = functions;
		this.config = config;
	}

	/**
	 * Defines a new agent function and returns it.
	 */
	public static function<T extends ModelFunctionParamSchema>(def: AgentFunction<T>) {
		return def;
	}

	/**
	 * Agent config.
	 */
	public readonly config: Config;

	/**
	 * Downloads and loads the agent model.
	 */
	public async load() {
		await this.config.load();
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
			systemPrompt: SYSTEM_PROMPT,
			contextSize: this.config.get('contextSize'),
			functions: this.getFunctionsWithContext(),
		});
		await this.loadedModel.load();
		this.emit('loadComplete');
	}

	/**
	 * Disposes the agent model.
	 */
	public async dispose() {
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
		const model = await this.getModel();
		this.emit('prompt', prompt);
		const response = await model.prompt(prompt);
		this.emit('promptComplete', prompt, response);
		return response;
	}

	/**
	 * Gets an active agent model or creates a new.
	 * @private
	 */
	private async getModel() {
		if (this.loadedModel) {
			return this.loadedModel;
		}
		await this.load();
		return this.loadedModel!;
	}

	/**
	 * Gets agent functions, bound to the current instance.
	 * @private
	 */
	private getFunctionsWithContext() {
		const boundFunctions: Record<string, ModelFunction> = {};
		if (this.functions) {
			for (const [key, def] of Object.entries(this.functions)) {
				boundFunctions[key] = Model.function({
					description: def.description,
					params: def.params,
					handler: (params) => def.handler(params, this),
				});
			}
		}
		return boundFunctions;
	}
}
