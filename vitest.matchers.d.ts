import 'vitest';

declare module 'vitest' {
	interface Matchers<T = any> {
		toBeSimilarTo: (expected: string, threshold?: number) => void;
	}
}
