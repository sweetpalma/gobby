import EventEmitter from 'events';
import { createLogger, format, transports } from 'winston';
import 'winston-daily-rotate-file';

/**
 * System Logger Options.
 */
export interface LoggerOptions {
	path: string;
	fileLimit?: number;
}

/**
 * System Logger Events.
 */
export interface LoggerEvents {
	error: [unknown];
	logError: [string, ...Array<unknown>];
	logInfo: [string, ...Array<unknown>];
	logWarn: [string, ...Array<unknown>];
}

/**
 * System Logger.
 */
export class Logger extends EventEmitter<LoggerEvents> {
	private winston: ReturnType<typeof createLogger>;

	constructor({ path, fileLimit }: LoggerOptions) {
		super();
		const formatFieldsOrder = format(({ timestamp, level, message, ...rest }) => {
			return { level, timestamp, message, ...rest };
		});
		const fileTransport = new transports.DailyRotateFile({
			dirname: path,
			filename: '%DATE%.log',
			maxFiles: fileLimit ?? 31,
		});
		fileTransport.on('error', (err) => {
			if (this.listenerCount('error') > 0) {
				this.emit('error', err);
			}
		});
		this.winston = createLogger({
			transports: fileTransport,
			format: format.combine(
				format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
				formatFieldsOrder(),
				format.json({ deterministic: false }),
			),
		});
	}

	/**
	 * Log info.
	 * @param message - Log message.
	 * @param meta - Log metadata (JSON serializable).
	 */
	public info(message: string, ...meta: Array<unknown>) {
		this.emit('logInfo', message, ...meta);
		this.winston.info(message, ...meta);
	}

	/**
	 * Log warning.
	 * @param message - Log message.
	 * @param meta - Log metadata (JSON serializable).
	 */
	public warn(message: string, ...meta: Array<unknown>) {
		this.emit('logWarn', message, ...meta);
		this.winston.warn(message, ...meta);
	}

	/**
	 * Log error.
	 * @param message - Log message.
	 * @param meta - Log metadata (JSON serializable).
	 */
	public error(message: string, ...meta: Array<unknown>) {
		this.emit('logError', message, ...meta);
		this.winston.error(message, ...meta);
	}
}
