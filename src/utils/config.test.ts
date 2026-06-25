import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fs, vol } from 'memfs';

import { mkdir, writeFile } from 'node:fs/promises';
import { Config, CONFIG_DEFAULTS } from './config';

vi.mock('node:fs/promises', () => fs.promises);
vi.mock('node:fs', () => fs);

describe('Config', () => {
	const workspace = '/workspace';

	beforeEach(() => {
		vol.reset();
	});

	it('throws an error if loaded config is invalid', async () => {
		const config = new Config({ workspace });
		await mkdir(workspace, { recursive: true });
		await writeFile(config.configPath, 'temperature: 2\n');
		await expect(() => config.load()).rejects.toThrow();
	});

	it('throws an error if provided values are invalid', () => {
		const config = new Config({ workspace });
		expect(() => config.set('temperature', 2)).toThrow();
		expect(() => config.set('contextSize', 10)).toThrow();
		expect(() => config.set('memorySize', 100)).toThrow();
		expect(() => config.set('idleTimeout', -1)).toThrow();
	});

	it('implements correct workspace paths', () => {
		const config = new Config({ workspace });
		expect(config.workspace).toBe(workspace);
		expect(config.configPath).toBe(`${workspace}/config.yml`);
		expect(config.memoryPath).toBe(`${workspace}/memory.yml`);
		expect(config.modelsPath).toBe(`${workspace}/models`);
		expect(config.cachePath).toBe(`${workspace}/cache`);
		expect(config.logsPath).toBe(`${workspace}/logs`);
	});

	it('implements default values', () => {
		const config = new Config({ workspace });
		expect(config.get('temperature')).toBe(CONFIG_DEFAULTS.temperature);
		expect(config.get('modelRepo')).toBe(CONFIG_DEFAULTS.modelRepo);
	});

	it('implements config detection functionality', async () => {
		const config = new Config({ workspace });
		expect(await config.exists()).toBe(false);
		await config.save();
		expect(await config.exists()).toBe(true);
	});

	it('implements save and load functionality', async () => {
		const configA = new Config({ workspace });
		configA.set('temperature', 0.9);
		await configA.save();
		const configB = new Config({ workspace });
		await configB.load();
		expect(configB.get('temperature')).toBe(0.9);
	});
});
