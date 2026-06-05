import { join, resolve, relative, dirname, isAbsolute } from 'node:path';
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { Agent } from '../agent';

const isInsideCwd = (resolvedPath: string): boolean => {
	const rel = relative(process.cwd(), resolvedPath);
	return !rel.startsWith('..') && !isAbsolute(rel);
};

export const filesystemCurrentWorkingDirectory = Agent.function({
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

export const filesystemList = Agent.function({
	description: 'List all files and directories in a specified folder path. Only paths inside the current working directory are allowed.',
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
			if (!isInsideCwd(resolvedPath)) {
				return {
					error: `Access denied: "${path}" is outside the current working directory. You can only access paths within: ${process.cwd()}`,
				};
			}
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

export const filesystemRead = Agent.function({
	description: 'Read the contents of a file at the specified path (as UTF-8 text). Only paths inside the current working directory are allowed.',
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
			if (!isInsideCwd(resolvedPath)) {
				return {
					error: `Access denied: "${path}" is outside the current working directory. You can only access paths within: ${process.cwd()}`,
				};
			}
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

export const filesystemWrite = Agent.function({
	description:
		'Write text content to a file at the specified path, creating it (and any missing parent directories) if it does not exist, or overwriting it if it does. Only paths inside the current working directory are allowed.',
	params: {
		type: 'object',
		required: ['path', 'content'],
		properties: {
			path: {
				type: 'string',
				description:
					'The path of the file to write (relative to the current working directory or absolute). Must be inside the current working directory.',
			},
			content: {
				type: 'string',
				description: 'The UTF-8 text content to write to the file.',
			},
		},
	},
	handler: async ({ path, content }: { path: string; content: string }) => {
		try {
			const resolvedPath = resolve(path);
			if (!isInsideCwd(resolvedPath)) {
				return {
					error: `Access denied: "${path}" is outside the current working directory. You can only write files within: ${process.cwd()}`,
				};
			}
			await mkdir(dirname(resolvedPath), { recursive: true });
			await writeFile(resolvedPath, content, 'utf-8');
			return {
				path: resolvedPath,
				bytesWritten: Buffer.byteLength(content, 'utf-8'),
			};
		} catch (err) {
			return {
				error: `Failed to write file: ${path}`,
			};
		}
	},
});
