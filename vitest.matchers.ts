import stringComparison from 'string-comparison';
import { expect } from 'vitest';

expect.extend({
	toBeSimilarTo: (received, expected, threshold = 0.75) => {
		received = received.trim().toLowerCase();
		expected = expected.trim().toLowerCase();
		const similarity = stringComparison.jaroWinkler.similarity(received, expected);
		return {
			message: () =>
				`"${received}" is too far from "${expected}" (expected ${threshold}, received ${similarity.toFixed(2)})`,
			pass: similarity >= threshold,
		};
	},
});
