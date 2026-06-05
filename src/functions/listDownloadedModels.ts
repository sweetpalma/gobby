import { join, dirname } from 'node:path';
import { readdirSync, statSync } from 'node:fs';
import { defineChatSessionFunction } from 'node-llama-cpp';

// Resolves to the root-level 'models' directory (which is ignored by .gitignore)
const localModelPath = join(process.cwd(), 'models');

export const listDownloadedModels = defineChatSessionFunction({
  description: 'List all downloaded GGUF model files in the local models directory, including their file names and sizes in gigabytes.',
  params: {
    type: 'object',
    properties: {},
  },
  handler: async () => {
    try {
      const files = readdirSync(localModelPath);
      const ggufFiles = files.filter((f) => f.endsWith('.gguf'));
      const models = ggufFiles.map((file) => {
        const stats = statSync(join(localModelPath, file));
        const sizeGB = (stats.size / (1024 * 1024 * 1024)).toFixed(2);
        return { name: file, size: `${sizeGB} GB` };
      });
      return { models };
    } catch (err) {
      throw new Error('Failed to read models directory');
    }
  },
});
