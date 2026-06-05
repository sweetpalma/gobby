import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { join } from 'node:path';

import { getLlama, LlamaChatSession } from 'node-llama-cpp';
import { downloadModel } from './utils/download.js';
import * as functions from './functions/index.js';

// Resolves to the root-level 'models' directory (which is ignored by .gitignore)
const localModelPath = join(process.cwd(), 'models');

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

  // 3. Functions are imported from the functions folder
  // 4. Start interactive chat loop
  console.log('\nChat session started. Type "exit" or "quit" to end the session.');
  const rl = readline.createInterface({ input, output });

  try {
    while (true) {
      const promptText = await rl.question('\nUser: ');
      const cleanPrompt = promptText.trim();
      if (!cleanPrompt) continue;

      if (cleanPrompt.toLowerCase() === 'exit' || cleanPrompt.toLowerCase() === 'quit') {
        console.log('Goodbye!');
        break;
      }

      process.stdout.write('Model: ');
      await session.prompt(cleanPrompt, {
        functions,
        onTextChunk: (chunk) => {
          process.stdout.write(chunk);
        },
      });
      console.log();
    }
  } finally {
    rl.close();
  }

} catch (error) {
  console.error('An error occurred:', error);
}
