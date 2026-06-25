import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fs, vol } from 'memfs';
import { configRead, configWrite } from './config';
import { Config, CONFIG_DEFAULTS } from '../utils/config';
import { Agent } from '../agent';

vi.mock('node:fs/promises', () => fs.promises);
vi.mock('node:fs', () => fs);

const mockAgent = (workspace: string) => {
	const config = new Config({ workspace });
	const agent: Partial<Agent> = { config };
	return agent as Agent;
};

describe('Tools (Config)', () => {
	const workspace = '/workspace';

	beforeEach(() => {
		vi.clearAllMocks();
		vol.reset();
		vol.fromJSON({
			'/workspace': null,
		});
	});

	describe('configRead', () => {
		it('returns the current config', async () => {
			const result = await configRead.handler({}, mockAgent(workspace));
			expect(CONFIG_DEFAULTS).toMatchObject(result);
		});
	});

	describe('configWrite', () => {
		it('updates only provided options and saves', async () => {
			const agent = mockAgent(workspace);
			const result = await configWrite.handler(
				{ contextSize: 64000, idleTimeout: 600, memorySize: 4096 },
				agent,
			);
			expect(result).toEqual({ success: true });
			expect(agent.config.get('contextSize')).toBe(64000);
			expect(agent.config.get('idleTimeout')).toBe(600);
			expect(agent.config.get('memorySize')).toBe(CONFIG_DEFAULTS.memorySize);
			const savedContent = fs.readFileSync(`/${workspace}/config.yml`, 'utf-8');
			expect(savedContent).toContain('contextSize: 64000');
			expect(savedContent).toContain('idleTimeout: 600');
			expect(savedContent).toContain('memorySize: 4096');
		});

		it('returns an error if values are invalid', async () => {
			vol.mkdirSync(`/${workspace}/config.yml`, { recursive: true });
			const result = await configWrite.handler(
				{ contextSize: 128, idleTimeout: 600, memorySize: 4096 },
				mockAgent(workspace),
			);
			expect(result.error).toContain('Failed to write config');
		});

		it('returns an error if config save fails', async () => {
			vol.mkdirSync(`/${workspace}/config.yml`, { recursive: true });
			const result = await configWrite.handler(
				{ contextSize: 64000, idleTimeout: 600, memorySize: 4096 },
				mockAgent(workspace),
			);
			expect(result.error).toContain('Failed to write config');
		});
	});
});
