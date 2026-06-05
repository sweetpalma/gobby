import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { getLlama, LlamaChatSession } from 'node-llama-cpp';
import { downloadModel } from './utils/download.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolves to the root-level 'models' directory (which is ignored by .gitignore)
const localModelPath = join(__dirname, '..', 'models');

const repo = 'Qwen/Qwen2.5-1.5B-Instruct-GGUF';
const path = 'qwen2.5-1.5b-instruct-q4_k_m.gguf';

try {
  // 1. Download the model (resumes if incomplete, skips if already fully downloaded)
  const modelPath = await downloadModel({
    repo,
    path,
    outputDir: localModelPath,
  });

  // 2. Load the model using node-llama-cpp
  console.log('Loading llama model...');
  const llama = await getLlama();
  const model = await llama.loadModel({ modelPath });
  const context = await model.createContext();
  const session = new LlamaChatSession({
    contextSequence: context.getSequence(),
  });

  // 3. Run basic inference
  const prompt = 'Write a short haiku about compiling code in space.';
  console.log(`\nUser: ${prompt}`);
  process.stdout.write('Model: ');

  await session.prompt(prompt, {
    onTextChunk: (chunk) => {
      process.stdout.write(chunk);
    },
  });
  console.log('\n');

} catch (error) {
  console.error('An error occurred:', error);
}
