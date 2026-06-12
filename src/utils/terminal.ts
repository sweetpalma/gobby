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
		process.on('SIGINT', debounce(() => {
			if (this.listenerCount('interrupt')) {
				this.emit('interrupt');
			} else {
				process.exit(0);
			}
		}, 100));
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
			let buffer = '';
			let col = 0;
			let row = 0;
			const startLine = (newline: boolean) => {
				if (newline) {
					this.write('\n');
				}
				if (row >= 1) {
					this.write(' '.repeat(prefixWidth));
				} else {
					this.stopSpinner();
					this.stopProgress();
					this.write(formatting.prefix ?? '');
				}
				row = row + 1;
				col = 0;
			};
			const flush = () => {
				if (buffer.length > 0) {
					const bufferWidth = stringWidth(buffer);
					if (col > 0 && col + bufferWidth > maxLineLength) {
						startLine(true);
					}
					if (col + bufferWidth <= maxLineLength) {
						this.write(buffer);
						col = col + bufferWidth;
						buffer = '';
						return;
					}
					for (const char of buffer) {
						const charWidth = stringWidth(char);
						if (col + charWidth > maxLineLength) {
							startLine(true);
						}
						this.write(char);
						col = col + charWidth;
					}
					buffer = '';
				}
			};
			stream.on('data', (data: string) => {
				for (const char of data) {
					if (row === 0) {
						startLine(false);
					}
					switch (char) {
						case ' ': {
							flush();
							if (col > 0 && col < maxLineLength) {
								this.write(' ');
								col = col + 1;
							}
							break;
						}
						case '\n': {
							flush();
							startLine(true);
							break;
						}
						default: {
							buffer = buffer + char;
							break;
						}
					}
				}
			});
			stream.on('error', (err) => {
				reject(err);
			});
			stream.on('end', () => {
				flush();
				if (row > 0) {
					this.write('\n');
				}
				resolve();
			});
		});
	}
}
