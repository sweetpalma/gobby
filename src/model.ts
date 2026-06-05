import { getLlama, LlamaChatSession } from 'node-llama-cpp';

export interface ModelOptions {
	path: string;
	systemPrompt?: string;
	contextSize?: number;
}

export class Model {
	private session?: LlamaChatSession;

	constructor(private opts: ModelOptions) {
		return;
	}

	public async load() {
		const llama = await getLlama();
		const model = await llama.loadModel({
			modelPath: this.opts.path,
		});
		const context = await model.createContext({
			contextSize: this.opts.contextSize,
			flashAttention: true,
		});
		return this.session = new LlamaChatSession({
			contextSequence: context.getSequence(),
			systemPrompt: this.opts.systemPrompt,
		});
	}
}