// A simple Node.js TypeScript entry point demonstrating modern ESM features
import { argv } from 'node:process';

export interface UserInfo {
  name: string;
  role: string;
  timestamp: string;
}

async function main() {
  const user: UserInfo = {
    name: 'Antigravity User',
    role: 'Developer',
    timestamp: new Date().toISOString()
  };

  console.log(`🚀 Modern TypeScript + Node.JS Environment Initialized!`);
  console.log(`👤 User Info:`, user);
  console.log(`Arguments passed:`, argv.slice(2));
}

// Top-level await is supported in modern ESM environments!
await main();
