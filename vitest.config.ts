import { defineConfig, mergeConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
	const common = defineConfig({
		test: {
			reporters: 'tree',
			setupFiles: ['./vitest.matchers.ts'],
		},
	});
	if (mode !== 'e2e') {
		return mergeConfig(common, {
			test: {
				include: ['src/**/*.test.ts'],
				fileParallelism: true,
			},
		});
	} else {
		return mergeConfig(common, {
			test: {
				include: ['e2e/**/*.test.ts'],
				execArgv: ['--max-old-space-size=8192'],
				fileParallelism: false,
				hookTimeout: 60 * 15 * 1000,
				testTimeout: 60 * 1000,
				slowTestThreshold: 30 * 1000,
			},
		});
	}
});
