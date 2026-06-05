import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { readdirSync, statSync } from 'node:fs';
import { getLlama, LlamaChatSession, defineChatSessionFunction } from 'node-llama-cpp';
import { downloadModel } from './utils/download.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolves to the root-level 'models' directory (which is ignored by .gitignore)
const localModelPath = join(__dirname, '..', 'models');

const repo = 'unsloth/Qwen3.5-4B-GGUF';
const path = 'Qwen3.5-4B-Q4_K_M.gguf';

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
  const context = await model.createContext({
    contextSize: 32000,
  });
  const session = new LlamaChatSession({
    contextSequence: context.getSequence(),
  });

  // 3. Define a local function that the LLM can call
  const listDownloadedModels = defineChatSessionFunction({
    description: 'List all downloaded GGUF model files in the local models directory, including their file names and sizes in gigabytes.',
    params: {
      type: 'object',
      properties: {},
    },
    handler: async () => {
      console.log('\n[Tool: listDownloadedModels is executing...]');
      try {
        const files = readdirSync(localModelPath);
        const ggufFiles = files.filter((f) => f.endsWith('.gguf'));
        const models = ggufFiles.map((file) => {
          const stats = statSync(join(localModelPath, file));
          const sizeGB = (stats.size / (1024 * 1024 * 1024)).toFixed(2);
          return { name: file, size: `${sizeGB} GB` };
        });
        console.log(`[Tool Result: Found ${models.length} model(s)]`);
        return { models };
      } catch (err) {
        console.error('[Tool Error]: Failed to read models directory', err);
        return { error: 'Failed to read models directory' };
      }
    },
  });

  // 4. Run inference prompting the model to use the tool
  const prompt = 'Please check my local models folder and tell me which model files are downloaded.';
  console.log(`\nUser: ${prompt}`);
  process.stdout.write('Model: ');

  await session.prompt(prompt, {
    functions: { listDownloadedModels },
    onTextChunk: (chunk) => {
      process.stdout.write(chunk);
    },
  });
  console.log('\n');

} catch (error) {
  console.error('An error occurred:', error);
}
