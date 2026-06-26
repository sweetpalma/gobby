import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import * as functions from '../src/functions';
import { Agent } from '../src/agent';
import { createAgent } from './utils';

const weather = Agent.function({
	description: 'Get the current weather.',
	params: {
		type: 'object',
		properties: {},
	},
	handler: vi.fn(() => {
		return 'Windy, 24°C';
	}),
});

describe('Agent (E2E)', () => {
	const agent = createAgent({
		...functions,
		weather,
	});

	beforeAll(async () => {
		await agent.load();
	});

	beforeEach(async () => {
		agent.reset();
	});

	afterAll(async () => {
		await agent.dispose();
	});

	it('should return a meaningful response to a basic greeting', async () => {
		const response = await agent.prompt({
			text: 'Hello! Please reply with exactly: "Hello, testing!"',
		});
		expect(response.text).toBeSimilarTo('Hello, testing!');
	});

	it('should exhibit its configured persona', async () => {
		const response = await agent.prompt({
			text: 'Who are you? Give me just a name.',
		});
		expect(response.text).toBeSimilarTo('Gobby');
	});

	it('should perform basic reasoning', async () => {
		const response = await agent.prompt({
			text: 'If I have 3 apples, eat 1, and then buy 2 more, how many apples do I have? Give me just a number.',
		});
		expect(response.text).toBeSimilarTo('4');
	});

	it('should handle basic math problems', async () => {
		const response = await agent.prompt({
			text: 'What is 2 + 2? Give me just the number.',
		});
		expect(response.text).toBeSimilarTo('4');
	});

	it('should inject persistent memory into the system prompt', async () => {
		agent.memory.add('The user loves eating pineapples.');
		const response = await agent.prompt({
			text: 'What is my favorite food? Give me just a name.',
		});
		expect(response.text).toBeSimilarTo('pineapple');
	});

	it('should use available tools', async () => {
		const response = await agent.prompt({
			text: 'Tell me the temperature outside. Give me just a number.',
		});
		expect(response.text).toBeSimilarTo('24°C');
		expect(weather.handler).toHaveBeenCalled();
	});
});
