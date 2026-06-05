import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { join } from 'node:path';

import { createSession } from './model';
import * as functions from './functions';

try {
  console.log('Loading model...');
  const session = await createSession();

  console.log('Chat session started. Type "exit" or "quit" to end the session.');
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
