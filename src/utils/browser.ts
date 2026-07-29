import { parseHTML } from 'linkedom';
import { ChromiumBrowser, chromium, errors } from 'patchright';
import { Readability } from '@mozilla/readability';
import { default as Turndown } from 'turndown';

/**
 * Browser Options.
 */
export interface BrowserOptions {
	timeout?: number;
}

/**
 * Browser Error.
 */
export class BrowserError extends Error {
	public override name = 'BrowserError';
}

/**
 * Lightweight Browser.
 */
export class Browser {
	private browser: ChromiumBrowser | null = null;
	private timeout: number;

	constructor(opts: BrowserOptions = {}) {
		this.timeout = opts.timeout ?? 15000;
	}

	/**
	 * Browser status.
	 */
	public get loaded() {
		return !!this.browser;
	}

	/**
	 * Loads browser.
	 */
	public async load() {
		if (this.browser) {
			return;
		}
		this.browser = await this.createStealthyBrowser();
		this.browser.on('disconnected', () => {
			this.browser = null;
		});
	}

	/**
	 * Disposes of loaded resources.
	 */
	public async dispose() {
		if (!this.browser) {
			return;
		}
		await this.browser.close();
		this.browser = null;
	}

	/**
	 * Reads URL as a Markdown document.
	 * @throws {BrowserError} If the browser is not loaded.
	 * @param url - URL to read.
	 * @param opts - Request options.
	 * @returns Document title and content.
	 */
	public async readMarkdown(url: string, opts: Partial<BrowserOptions> = {}) {
		const document = await this.readDocument(url, opts);
		const article = new Readability(document).parse();
		const content = article?.content ?? document.body.innerHTML;
		const turndown = new Turndown({
			headingStyle: 'atx',
			codeBlockStyle: 'fenced',
		});
		return {
			title: document.title,
			body: turndown.turndown(content),
		};
	}

	/**
	 * Reads URL as interactive document.
	 * @throws {BrowserError} If the browser is not loaded.
	 * @param url - URL to read.
	 * @param opts - Request options.
	 * @returns Document.
	 */
	public async readDocument(url: string, opts: Partial<BrowserOptions> = {}) {
		const context = await this.createStealthyContext();
		try {
			const page = await context.newPage();
			page.on('dialog', (dialog) => {
				dialog.dismiss();
			});
			try {
				await page.route('**/*', (route) => {
					const type = route.request().resourceType();
					if (['image', 'font', 'media'].includes(type)) {
						return route.abort();
					} else {
						return route.continue();
					}
				});
				await page.goto(url, {
					waitUntil: 'load',
					timeout: opts.timeout ?? this.timeout,
				});
			} catch (err) {
				// Timeout errors could be safely ignored.
				if (!(err instanceof errors.TimeoutError)) {
					const msg = err instanceof Error ? err.message : `${err}`;
					throw new BrowserError(msg);
				}
			}
			try {
				const { document } = parseHTML(await page.content());
				return document;
			} catch (err) {
				const msg = err instanceof Error ? err.message : `${err}`;
				throw new BrowserError(`Failed to parse page: ${msg}`);
			}
		} finally {
			await context.close();
		}
	}

	/**
	 * Creates a new stealthy context instance and returns it.
	 * @returns Context instance.
	 * @private
	 */
	private async createStealthyContext() {
		if (!this.browser) {
			throw new BrowserError('Browser is not loaded.');
		}
		return this.browser.newContext({
			viewport: { width: 1920, height: 1080 },
		});
	}

	/**
	 * Creates a new stealthy browser instance and returns it.
	 * @returns Browser instance.
	 * @private
	 */
	private async createStealthyBrowser() {
		const temporaryBrowser = await chromium.launch({ headless: true });
		const args: Array<string> = [];
		try {
			const temporaryPage = await temporaryBrowser.newPage();
			const headlessAgent = await temporaryPage.evaluate('navigator.userAgent');
			const stealthyAgent = (headlessAgent as string).replace('HeadlessChrome', 'Chrome');
			args.push(`--user-agent=${stealthyAgent}`);
		} finally {
			await temporaryBrowser.close();
		}
		args.push('--disable-blink-features=AutomationControlled');
		return chromium.launch({ headless: true, args });
	}
}
