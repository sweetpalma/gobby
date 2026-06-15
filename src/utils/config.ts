import { dirname, join } from 'node:path';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import yml from 'yaml';
import zod from 'zod';

/**
 * Config Schema.
 * @internal
 */
export const ConfigSchema = zod.object({
	modelRepo: zod.string(),
	modelPath: zod.string(),
	temperature: zod.number().min(0).max(1),
	contextSize: zod.number().min(32768).max(262144),
	memorySize: zod.number().min(512).max(8096),
	idleTimeout: zod.number().min(0).max(3600),
});

/**
 * Config Schema Type.
 * @internal
 */
export type ConfigSchema = zod.infer<typeof ConfigSchema>;

/**
 * Config Defaults.
 * @internal
 */
export const CONFIG_DEFAULTS: ConfigSchema = {
	modelRepo: 'unsloth/Qwen3.5-4B-GGUF',
	modelPath: 'Qwen3.5-4B-Q4_K_M.gguf',
	temperature: 0.25,
	contextSize: 32768,
	memorySize: 4096,
	idleTimeout: 300,
};

/**
 * Config Options.
 */
export interface ConfigOptions {
	workspace: string;
	params?: Partial<ConfigSchema>;
}

/**
 * Config Container.
 */
export class Config {
	private params: ConfigSchema = {
		...CONFIG_DEFAULTS,
	};

	constructor(opts: ConfigOptions) {
		this.workspace = opts.workspace;
		Object.assign(this.params, opts.params ?? {});
	}

	/**
	 * Workspace root path.
	 */
	public readonly workspace: string;

	/**
	 * Workspace models path.
	 */
	public get modelsPath() {
		return join(this.workspace, 'models');
	}

	/**
	 * Workspace logs path.
	 */
	public get logsPath() {
		return join(this.workspace, 'logs');
	}

	/**
	 * Workspace cache path.
	 */
	public get cachePath() {
		return join(this.workspace, 'cache');
	}

	/**
	 * Workspace config path.
	 */
	public get configPath() {
		return join(this.workspace, 'config.yml');
	}

	/**
	 * Workspace memory path.
	 */
	public get memoryPath() {
		return join(this.workspace, 'memory.yml');
	}

	/**
	 * Gets config option.
	 */
	public get<K extends keyof ConfigSchema>(key: K) {
		return this.params[key];
	}

	/**
	 * Sets config option.
	 * @throws {Error} If the value fails schema validation.
	 */
	public set<K extends keyof ConfigSchema>(key: K, value: ConfigSchema[K]) {
		const fieldSchema = ConfigSchema.shape[key];
		const { data, error } = fieldSchema.safeParse(value);
		if (!error) {
			this.params[key] = data as ConfigSchema[K];
		} else {
			const msg = zod.prettifyError(error);
			throw new Error(msg);
		}
	}

	/**
	 * Checks if config exists in a current workspace.
	 */
	public async exists() {
		try {
			await readFile(this.configPath, 'utf-8');
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Loads config from a current workspace.
	 */
	public async load() {
		if (!(await this.exists())) {
			return;
		}
		const config = await readFile(this.configPath, 'utf-8');
		const { data, error } = ConfigSchema.partial().safeParse(yml.parse(config));
		if (!error) {
			Object.assign(this.params, data);
		} else {
			const msg = zod.prettifyError(error);
			throw new Error(msg);
		}
	}

	/**
	 * Saves config to a current workspace.
	 */
	public async save() {
		const str = yml.stringify(this.params);
		await mkdir(dirname(this.configPath), { recursive: true });
		await writeFile(this.configPath, str);
	}
}
