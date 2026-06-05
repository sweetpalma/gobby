import { stdin, stdout } from 'node:process';
import { Interface, createInterface } from 'node:readline/promises';
import { Readable, Writable } from 'node:stream';
import { EventEmitter } from 'node:events';

import terminalSize from 'terminal-size';
import { SingleBar, Preset, Presets } from 'cli-progress';
import createSpinner from 'ora';
import ansi from 'ansi-escapes';

/**
 * Terminal Options.
 */
export interface TerminalOptions {
	output?: Writable;
	input?: Readable;
	lineWidth?: number;
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
	private session: Interface;
	private progress = new SingleBar({ format: '{bar} | {percentage}%' }, Presets.rect);
	private spinner = createSpinner({ discardStdin: false });
	private emitter = new EventEmitter<TerminalEventMap>();

	constructor(private readonly opts: TerminalOptions = {}) {
		this.session = createInterface({
			input: opts.input ?? stdin,
			output: opts.output ?? stdout,
		});
		this.session.on('SIGINT', () => {
			if (this.emitter.listenerCount('interrupt')) {
				this.emitter.emit('interrupt');
			} else {
				process.emit('SIGINT');
			}
		});
	}

	/**
	 * Gets current terminal size.
	 */
	public get size() {
		const { columns: width, rows: height } = terminalSize();
		return { width, height };
	}

	/**
	 * Gets max allowed terminal line width.
	 */
	public get lineWidth() {
		return this.opts.lineWidth ?? this.size.width - 16;
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
	public startSpinner(text?: string) {
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
	 * @parma text - Text to write.
	 */
	public write(text?: string) {
		this.session.write(text ?? '');
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
	public async prompt() {
		return new Promise<string | null>((resolve, reject) => {
			const interruptHandler = () => {
				resolve(null);
			};
			this.once('interrupt', interruptHandler);
			this.session.question('')
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
	public async stream(stream: Readable) {
		return new Promise<void>((resolve, reject) => {
			let lineWidth = 0;
			let lines = 0;
			stream.on('data', (data: string) => {
				if (lines === 0) {
					this.stopSpinner();
					this.stopProgress();
					lines = 1;
				}
				if (lineWidth < this.lineWidth) {
					this.session.write(data);
					lineWidth += data.length;
				} else {
					this.session.write('\n');
					this.session.write(data.trimStart());
					lineWidth = 0;
					lines++;
				}
				if (data.includes('\n')) {
					lineWidth = 0;
					lines++;
				}
			});
			stream.on('error', (err) => {
				reject(err);
			});
			stream.on('end', () => {
				if (lines) {
					this.session.write('\n');
				}
				resolve();
			});
		});
	}
}

/**
 * Terminal Default Instance.
 */
export const tui = new Terminal();
export default tui;
