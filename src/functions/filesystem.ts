import glob from 'fast-glob';
import { DiffMatchPatch } from 'diff-match-patch-ts';
import { join, resolve, relative, dirname, isAbsolute } from 'node:path';
import { createReadStream } from 'node:fs';
import { readFile, writeFile, mkdir, readdir, stat, rm } from 'node:fs/promises';
import { createInterface } from 'node:readline';
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
		return {
			cwd: process.cwd(),
		};
	},
});

export const filesystemList = Agent.function({
	description:
		'List all files and directories in a specified folder path. Only paths inside the current working directory are allowed.',
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
	handler: async ({ path }) => {
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
				error: `Failed to list files in directory: ${err instanceof Error ? err.message : err}`,
			};
		}
	},
});

export const filesystemRead = Agent.function({
	description:
		'Read the contents of a file at the specified path (as UTF-8 text). Only paths inside the current working directory are allowed.',
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
	handler: async ({ path }) => {
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
				error: `Failed to read file: ${err instanceof Error ? err.message : err}`,
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
	handler: async ({ path, content }) => {
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
				error: `Failed to write file: ${err instanceof Error ? err.message : err}`,
			};
		}
	},
});

export const filesystemDelete = Agent.function({
	description:
		'Delete a file or directory at the specified path. Directories are deleted recursively. Only paths inside the current working directory are allowed.',
	params: {
		type: 'object',
		required: ['path'],
		properties: {
			path: {
				type: 'string',
				description:
					'The path of the file or directory to delete. Must be inside the current working directory.',
			},
		},
	},
	handler: async ({ path }) => {
		try {
			const resolvedPath = resolve(path);
			if (!isInsideCwd(resolvedPath)) {
				return {
					error: `Access denied: "${path}" is outside the current working directory. You can only delete paths within: ${process.cwd()}`,
				};
			}
			if (resolvedPath === process.cwd()) {
				return {
					error: 'Cannot delete the current working directory itself.',
				};
			}
			await rm(resolvedPath, { recursive: true });
			return {
				path: resolvedPath,
				deleted: true,
			};
		} catch (err) {
			return {
				error: `Failed to delete: ${err instanceof Error ? err.message : err}`,
			};
		}
	},
});

export const filesystemPatch = Agent.function({
	description:
		'Surgically edit a file by finding a string and replacing it with new content. Uses fuzzy matching, so the search string does not need to perfectly match whitespace and indentation. Only paths inside the current working directory are allowed.',
	params: {
		type: 'object',
		required: ['path', 'search', 'replace'],
		properties: {
			path: {
				type: 'string',
				description:
					'The path of the file to patch (relative to the current working directory or absolute). Must be inside the current working directory.',
			},
			search: {
				type: 'string',
				description:
					'The string to search for in the file. Should be a reasonably unique snippet of the existing code.',
			},
			replace: {
				type: 'string',
				description: 'The string to replace the matched content with.',
			},
		},
	},
	handler: async ({ path, search, replace }) => {
		try {
			const resolvedPath = resolve(path);
			if (!isInsideCwd(resolvedPath)) {
				return {
					error: `Access denied: "${path}" is outside the current working directory. You can only patch files within: ${process.cwd()}`,
				};
			}
			const contents = await readFile(resolvedPath, 'utf-8');
			const dmp = new DiffMatchPatch();
			const patches = dmp.patch_make(search, replace);
			const [patched, results] = dmp.patch_apply(patches, contents);
			const allApplied = results.every((result) => {
				return result === true;
			});
			if (!allApplied || patches.length === 0) {
				return {
					error: `Patch failed: Could not fuzzily match the search string in "${path}". Please ensure the search string is sufficiently unique and similar to the file contents.`,
				};
			}
			await writeFile(resolvedPath, patched, 'utf-8');
			return {
				path: resolvedPath,
				bytesWritten: Buffer.byteLength(patched, 'utf-8'),
			};
		} catch (err) {
			return {
				error: `Failed to patch file: ${err instanceof Error ? err.message : err}`,
			};
		}
	},
});

export const filesystemFind = Agent.function({
	description:
		'Find files and directories matching a glob pattern within the current working directory. Use this to locate files before reading or patching them.',
	params: {
		type: 'object',
		required: ['pattern'],
		properties: {
			pattern: {
				type: 'string',
				description:
					'Glob pattern to match (e.g. "**/*.ts", "src/**", "*.json"). Always scoped to the current working directory.',
			},
			limit: {
				type: 'number',
				description: 'Search result limit. Equals to 100 by default.',
			},
		},
	},
	handler: async ({ pattern, limit }) => {
		try {
			const searchLimit = limit ?? 100;
			const files = await glob(pattern, {
				cwd: process.cwd(),
				dot: false,
				onlyFiles: false,
				ignore: ['node_modules/**', '.git/**', 'dist/**'],
			});
			return {
				pattern,
				files: files.slice(0, searchLimit),
				total: files.length,
				truncated: files.length > searchLimit,
			};
		} catch (err) {
			return {
				error: `Failed to find files: ${err instanceof Error ? err.message : err}`,
			};
		}
	},
});

export const filesystemGrep = Agent.function({
	description:
		'Search file contents for a text string across the current working directory. Returns matching lines with their file path and line number. Use this instead of reading multiple files when looking for a specific symbol, value, or pattern.',
	params: {
		type: 'object',
		required: ['query'],
		properties: {
			query: {
				type: 'string',
				description: 'The text string to search for inside file contents.',
			},
			pattern: {
				type: 'string',
				description:
					'Optional glob pattern to limit which files are searched (e.g. "**/*.ts"). Defaults to all files.',
			},
			caseSensitive: {
				type: 'boolean',
				description: 'Whether the match is case-sensitive. Disabled by default.',
			},
			limit: {
				type: 'number',
				description: 'Search result limit. Equals to 50 by default.',
			},
		},
	},
	handler: async ({ query, pattern, caseSensitive, limit }) => {
		try {
			const matchLimit = limit ?? 50;
			const files = await glob(pattern ?? '**/*', {
				cwd: process.cwd(),
				dot: false,
				onlyFiles: true,
				ignore: ['node_modules/**', '.git/**', 'dist/**'],
			});
			const searchStr = caseSensitive ? query : query.toLowerCase();
			const matches: Array<{ file: string; line: number; content: string }> = [];
			for (const file of files) {
				if (matches.length >= matchLimit) {
					break;
				}
				try {
					const stream = createReadStream(join(process.cwd(), file), 'utf-8');
					const rl = createInterface({
						input: stream,
						crlfDelay: Infinity,
					});
					let lineNum = 1;
					for await (const line of rl) {
						if (matches.length >= matchLimit) {
							rl.close();
							stream.destroy();
							break;
						}
						const lineStr = caseSensitive ? line : line.toLowerCase();
						if (lineStr.includes(searchStr)) {
							matches.push({
								file,
								line: lineNum,
								content: line.trim(),
							});
						}
						lineNum = lineNum + 1;
					}
				} catch {
					// Skip unreadable files (binary, permission errors, etc.)
				}
			}
			return {
				query,
				matches,
				total: matches.length,
				truncated: matches.length >= matchLimit,
			};
		} catch (err) {
			return {
				error: `Failed to search files: ${err instanceof Error ? err.message : err}`,
			};
		}
	},
});
