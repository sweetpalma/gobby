import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { ReadStream, WriteStream } from 'node:tty';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';

import { debounce } from 'es-toolkit';
import stringWidth from 'string-width';
import terminalSize from 'terminal-size';
import { SingleBar, Presets } from 'cli-progress';
import createSpinner, { Ora } from 'ora';
import ansi from 'ansi-escapes';
import chalk from 'chalk';

/**
 * Terminal Options.
 */
export interface TerminalOptions {
	input?: ReadStream;
	output?: WriteStream;
	maxLineLength?: number;
}

/**
 * Terminal Default Formatting.
 */
export interface TerminalFormatting {
	prefix?: string;
}

/**
 * Terminal Event Map.
 * @internal
 */
export interface TerminalEvents {
	interrupt: [];
}

/**
 * Terminal Container.
 */
export class Terminal extends EventEmitter<TerminalEvents> {
	private progress: SingleBar;
	private spinner: Ora;

	constructor(private readonly opts: TerminalOptions = {}) {
		super();
		this.io = {
			input: opts.input ?? stdin,
			output: opts.output ?? stdout,
		};
		this.spinner = createSpinner({
			stream: this.io.output,
			discardStdin: false,
			color: 'white',
		});
		this.progress = new SingleBar(
			{
				stream: this.io.output,
				format: '{bar} | {percentage}%',
				clearOnComplete: true,
				hideCursor: true,
			},
			Presets.rect,
		);
		process.on(
			'SIGINT',
			debounce(() => {
				if (this.listenerCount('interrupt')) {
					this.emit('interrupt');
				} else {
					process.exit(0);
				}
			}, 100),
		);
	}

	/**
	 * I/O streams.
	 */
	public readonly io: {
		input: ReadStream;
		output: WriteStream;
	};

	/**
	 * Gets current terminal size.
	 */
	public get size() {
		const { columns: width, rows: height } = terminalSize();
		return { width, height };
	}

	/**
	 * Starts a spinner.
	 */
	public startSpinner(text?: string, formatting: TerminalFormatting = {}) {
		this.spinner.prefixText = formatting.prefix ?? '';
		this.spinner.start(chalk.dim(text ?? ' '));
	}

	/**
	 * Stops a spinner.
	 */
	public stopSpinner() {
		if (this.spinner.isSpinning) {
			this.spinner.stop();
		}
	}

	/**
	 * Starts a progress bar.
	 */
	public startProgress(total: number, initial: number = 0) {
		this.progress.start(total, initial);
	}

	/**
	 * Stops a progress bar.
	 */
	public stopProgress() {
		if (this.progress.isActive) {
			this.progress.stop();
		}
	}

	/**
	 * Updates a progress bar.
	 */
	public updateProgress(value: number) {
		this.progress.update(value);
	}

	/**
	 * Writes the given text to the output.
	 * @param text - Text to write.
	 */
	public write(text?: string) {
		this.io.output.write(text ?? '');
	}

	/**
	 * Writes the given text to the output, followed by a newline.
	 * @param text - Text to write.
	 */
	public print(text?: string) {
		this.write(text);
		this.write('\n');
	}

	/**
	 * Erases last line.
	 */
	public erase(lines: number = 1) {
		for (let i = 0; i < lines; i++) {
			this.write(ansi.eraseEndLine);
			this.write(ansi.eraseStartLine);
			this.write(ansi.cursorPrevLine);
			this.write(ansi.eraseEndLine);
		}
	}

	/**
	 * Drains current input - for example, for piping.
	 * @returns Drained input.
	 */
	public async drain() {
		const chunks: Array<string> = [];
		for await (const chunk of this.io.input) {
			chunks.push(chunk.toString());
		}
		return chunks.join('');
	}

	/**
	 * Prompts user.
	 * @returns User input.
	 */
	public async prompt(formatting: TerminalFormatting = {}) {
		const session = createInterface({
			input: this.io.input,
			output: this.io.output,
		});
		return new Promise<string | null>((resolve, reject) => {
			session.once('SIGINT', () => {
				resolve(null);
			});
			session
				.question(formatting.prefix ?? '')
				.then((text) => resolve(text))
				.catch((err) => reject(err));
		}).finally(() => {
			session.close();
			session.removeAllListeners();
		});
	}

	/**
	 * Writes the given stream to the output, and resolves when the stream has ended.
	 * @param stream - Stream to output.
	 */
	public async stream(stream: Readable, formatting: TerminalFormatting = {}) {
		const prefixWidth = stringWidth(formatting.prefix ?? '');
		const maxLineLength = Math.min(
			this.opts.maxLineLength ?? Number.MAX_SAFE_INTEGER,
			this.size.width - prefixWidth,
		);
		return new Promise<void>((resolve, reject) => {
			const [boldOn, boldOff] = chalk.bold(' ').split(' ');
			const [cyanOn, cyanOff] = chalk.cyan(' ').split(' ');
			const state = {
				buffer: '',
				col: 0,
				row: 0,
				pendingAsterisk: false,
				bold: false,
				code: false,
			};
			const startLine = (newline: boolean) => {
				if (newline) {
					this.write('\n');
				}
				if (state.row >= 1) {
					this.write(' '.repeat(prefixWidth));
				} else {
					this.stopSpinner();
					this.stopProgress();
					this.write(formatting.prefix ?? '');
				}
				state.row = state.row + 1;
				state.col = 0;
			};
			const flush = () => {
				if (state.buffer.length > 0) {
					const bufferWidth = stringWidth(state.buffer);
					if (state.col > 0 && state.col + bufferWidth > maxLineLength) {
						startLine(true);
					}
					if (state.col + bufferWidth <= maxLineLength) {
						this.write(state.buffer);
						state.col = state.col + bufferWidth;
						state.buffer = '';
						return;
					}
					let i = 0;
					while (i < state.buffer.length) {
						if (state.buffer[i] === '\x1b') {
							const end = state.buffer.indexOf('m', i);
							if (end !== -1) {
								this.write(state.buffer.slice(i, end + 1));
								i = end + 1;
								continue;
							}
						}
						const char = String.fromCodePoint(state.buffer.codePointAt(i)!);
						const charWidth = stringWidth(char);
						if (state.col + charWidth > maxLineLength) {
							startLine(true);
						}
						this.write(char);
						state.col = state.col + charWidth;
						i += char.length;
					}
					state.buffer = '';
				}
			};
			const handleChar = (char: string) => {
				switch (char) {
					case ' ': {
						flush();
						if (state.col > 0 && state.col < maxLineLength) {
							this.write(' ');
							state.col = state.col + 1;
						}
						break;
					}
					case '\n': {
						flush();
						startLine(true);
						break;
					}
					default: {
						state.buffer = state.buffer + char;
						break;
					}
				}
			};
			stream.on('data', (data: string) => {
				for (const char of data) {
					if (state.row === 0) {
						startLine(false);
					}
					if (state.pendingAsterisk && char !== '*') {
						state.pendingAsterisk = false;
						handleChar('*');
					}
					if (char === '*') {
						if (state.pendingAsterisk) {
							state.bold = !state.bold;
							state.pendingAsterisk = false;
							state.buffer += state.bold ? boldOn : boldOff;
						} else {
							state.pendingAsterisk = true;
						}
						continue;
					}
					if (char === '\`') {
						state.code = !state.code;
						state.buffer += state.code ? cyanOn : cyanOff;
						continue;
					}
					handleChar(char);
				}
			});
			stream.on('error', (err) => {
				reject(err);
			});
			stream.on('end', () => {
				if (state.pendingAsterisk) {
					handleChar('*');
				}
				flush();
				if (state.bold) {
					this.write(boldOff);
				}
				if (state.code) {
					this.write(cyanOff);
				}
				if (state.row > 0) {
					this.write('\n');
				}
				resolve();
			});
		});
	}
}
