import { join } from 'node:path';
import { Agent, AgentFunction } from '../src/agent';
import { Config } from '../src/utils/config';

export const createAgent = (functions: Record<string, AgentFunction>) => {
	const agent = new Agent({
		functions,
		config: new Config({
			workspace: join(__dirname, '..', 'e2e_workspace'),
			params: {
				temperature: 0,
				idleTimeout: 0,
			},
		}),
	});
	agent.once('download', () => {
		console.log('Downloading model, this may take a while...');
	});
	agent.once('downloadComplete', () => {
		console.log('Download complete, running tests...');
	});
	return agent;
};
