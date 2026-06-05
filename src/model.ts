import { join } from 'node:path';
import { getLlama, LlamaChatSession } from 'node-llama-cpp';
import { downloadModel as downloadModelFrom } from './utils/download';

export const MODEL_REPO_NAME = 'unsloth/Qwen3.5-4B-GGUF';
export const MODEL_REPO_PATH = 'Qwen3.5-4B-Q4_K_M.gguf';

export const MODEL_STORAGE = join(process.cwd(), 'models');
export const MODEL_CONTEXT_LENGTH = 32000;

export { downloadModelFrom };
export const downloadModel = async () => {
	return downloadModelFrom({
		repo: MODEL_REPO_NAME,
		path: MODEL_REPO_PATH,
		outputDir: MODEL_STORAGE,
	});
};

export const loadModel = async () => {
	const llama = await getLlama();
	const modelPath = await downloadModel();
	return llama.loadModel({ modelPath });
};

export const createSession = async (systemPrompt?: string) => {
	const model = await loadModel();
	const context = await model.createContext({
		contextSize: MODEL_CONTEXT_LENGTH,
	});
	return new LlamaChatSession({
		contextSequence: context.getSequence(),
		systemPrompt,
	});
};
