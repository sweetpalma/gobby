import { stdin, stdout } from 'node:process';
import { Interface, createInterface } from 'node:readline/promises';
import { Readable, Writable } from 'node:stream';
import { EventEmitter } from 'node:events';

import stringWidth from 'string-width';
import terminalSize from 'terminal-size';
import { SingleBar, Presets } from 'cli-progress';
import createSpinner, { Ora } from 'ora';
import ansi from 'ansi-escapes';

/**
 * Terminal Options.
 */
export interface TerminalOptions {
	output?: Writable;
	input?: Readable;
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
export interface TerminalEventMap {
	interrupt: [];
}

/**
 * Terminal Event Handler Type.
 * @internal
 */
export interface TerminalEventHandler<T extends keyof TerminalEventMap> {
	(...args: TerminalEventMap[T]): void;
}

/**
 * Terminal Container.
 */
export class Terminal {
	private emitter = new EventEmitter<TerminalEventMap>();
	private progress: SingleBar;
	private session: Interface;
	private spinner: Ora;

	constructor(private readonly opts: TerminalOptions = {}) {
		this.io = {
			input: opts.input ?? stdin,
			output: opts.output ?? stdout,
		};
		this.session = createInterface({
			input: this.io.input,
			output: this.io.output,
		});
		this.spinner = createSpinner({
			stream: this.io.output,
			discardStdin: false,
			color: false
		})
		this.progress = new SingleBar({
			format: '{bar} | {percentage}%',
			stream: this.io.output,
		}, Presets.rect);
		this.session.on('SIGINT', () => {
			if (this.emitter.listenerCount('interrupt')) {
				this.emitter.emit('interrupt');
			} else {
				process.emit('SIGINT');
			}
		});
	}

	/**
	 * I/O streams.
	 */
	public readonly io: {
		input: Readable;
		output: Writable;
	};

	/**
	 * Gets current terminal size.
	 */
	public get size() {
		const { columns: width, rows: height } = terminalSize();
		return { width, height };
	}

	/**
	 * Binds an event listener.
	 * @param type - Event type.
	 * @param handler - Event listener.
	 */
	public on<T extends keyof TerminalEventMap>(
		type: T,
		handler: TerminalEventHandler<T>,
	) {
		this.emitter.on(type, handler);
	}

	/**
	 * Binds an event listener (runs one time).
	 * @param type - Event type.
	 * @param handler - Event listener.
	 */
	public once<T extends keyof TerminalEventMap>(
		type: T,
		handler: TerminalEventHandler<T>,
	) {
		this.emitter.once(type, handler);
	}

	/**
	 * Unbinds and event listener.
	 * @param type - Event type.
	 * @param handler - Event listener.
	 */
	public off<T extends keyof TerminalEventMap>(
		type: T,
		handler: TerminalEventHandler<T>,
	) {
		this.emitter.off(type, handler);
	}

	/**
	 * Starts a spinner.
	 */
	public startSpinner(text?: string, formatting: TerminalFormatting = {}) {
		this.spinner.prefixText = formatting.prefix ?? '';
		this.spinner.start(text ?? ' ');
	}

	/**
	 * Stops a spinner.
	 */
	public stopSpinner() {
		this.spinner.stop();
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
			this.erase();
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
	public erase() {
		this.write(ansi.eraseLine);
		this.write(ansi.cursorPrevLine);
	}

	/**
	 * Prompts user.
	 * @returns User input.
	 */
	public async prompt(formatting: TerminalFormatting = {}) {
		return new Promise<string | null>((resolve, reject) => {
			const interruptHandler = () => {
				resolve(null);
			};
			this.once('interrupt', interruptHandler);
			this.session.question(formatting.prefix ?? '')
				.then((text) => {
					resolve(text);
				})
				.catch((err) => {
					reject(err);
				})
				.finally(() => {
					this.off('interrupt', interruptHandler);
				});
		});
	}

	/**
	 * Writes the given stream to the output, and resolves when the stream has ended.
	 * @param stream - Stream to output.
	 */
	public async stream(stream: Readable, formatting: TerminalFormatting = {}) {
		const maxLineWidth = this.size.width - stringWidth(formatting.prefix ?? '') - 1;
		return new Promise<void>((resolve, reject) => {
			let col = 0;
			let row = 0;
			let buffer = '';
			const startLine = (newline: boolean) => {
				if (newline) {
					this.write('\n');
				}
				if (row >= 1) {
					const indent = ' '.repeat(stringWidth(formatting.prefix ?? ''));
					this.write(indent);
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
					if (col > 0 && col + bufferWidth > maxLineWidth) {
						startLine(true);
					}
					if (col + bufferWidth <= maxLineWidth) {
						this.write(buffer);
						col = col + bufferWidth;
						buffer = '';
						return;
					}
					for (const char of buffer) {
						const charWidth = stringWidth(char);
						if (col + charWidth > maxLineWidth) {
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
							if (col > 0 && col < maxLineWidth) {
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
				this.write('\n');
				resolve();
			});
		});
	}
}
