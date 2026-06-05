import { defineChatSessionFunction } from 'node-llama-cpp';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export const filesystemCurrentWorkingDirectory = defineChatSessionFunction({
	description: 'Get the absolute path of the current working directory.',
	params: {
		type: 'object',
		properties: {},
	},
	handler: async () => {
		try {
			return {
				cwd: process.cwd(),
			};
		} catch (err) {
			return {
				error: 'Failed to get current working directory',
			};
		}
	},
});

export const filesystemList = defineChatSessionFunction({
	description: 'List all files and directories in a specified folder path.',
	params: {
		type: 'object',
		required: ['path'],
		properties: {
			path: {
				type: 'string',
				description:
					'The directory path to list files from (e.g., ".", "src", "models", or an absolute path).',
			},
		},
	},
	handler: async ({ path }: { path: string }) => {
		try {
			const resolvedPath = resolve(path);
			const items = await readdir(resolvedPath);
			const files = await Promise.all(
				items.map(async (item) => {
					const fullPath = join(resolvedPath, item);
					try {
						const stats = await stat(fullPath);
						const isDirectory = stats.isDirectory();
						return {
							name: item,
							type: isDirectory ? 'directory' : 'file',
							size: isDirectory ? 0 : stats.size,
						};
					} catch {
						return {
							name: item,
							type: 'unknown',
							size: 0,
						};
					}
				}),
			);
			return {
				directory: resolvedPath,
				files,
			};
		} catch (err) {
			return {
				error: `Failed to list files in directory: ${path}`,
			};
		}
	},
});

export const filesystemRead = defineChatSessionFunction({
	description: 'Read the contents of a file at the specified path (as UTF-8 text).',
	params: {
		type: 'object',
		required: ['path'],
		properties: {
			path: {
				type: 'string',
				description:
					'The path of the file to read (relative to the current working directory or absolute).',
			},
		},
	},
	handler: async ({ path }: { path: string }) => {
		try {
			const resolvedPath = resolve(path);
			const content = await readFile(resolvedPath, 'utf-8');
			return {
				path: resolvedPath,
				content,
			};
		} catch (err) {
			return {
				error: `Failed to read file: ${path}`,
			};
		}
	},
});
