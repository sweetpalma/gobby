import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { datetime } from './datetime';
import { Agent } from '../agent';

const mockAgent = () => {
	return {} as Agent;
};

describe('Tools (Datetime)', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('datetime', () => {
		it('returns the current local time, ISO string, and timezone', () => {
			const mockDate = new Date('2026-06-25T12:00:00.000Z');
			vi.setSystemTime(mockDate);
			const result = datetime.handler({}, mockAgent());
			expect(result).toMatchObject({
				iso: '2026-06-25T12:00:00.000Z',
				local: mockDate.toLocaleString('en', { dateStyle: 'full', timeStyle: 'long' }),
				timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
			});
		});
	});
});
