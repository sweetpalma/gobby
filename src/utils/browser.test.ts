import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Browser } from './browser';

const testPage = `
<head>
	<title>Hello World!</title>
	<script>
		window.onload = function() {
			document.getElementById('dynamic').innerHTML = '<span>Dynamic Content!</span>';
		};
	</script>
</head>
<body>
	<div id="dynamic"></div>
	<div id="static">
		<span>Static Content!</span>
	</div>
</body>	
`;

describe('Browser', () => {
	const testUrl = 'data:text/html,' + encodeURIComponent(testPage);
	const browser = new Browser();

	beforeAll(async () => {
		await browser.load();
	});

	afterAll(async () => {
		await browser.dispose();
	});

	it('renders both static and dynamic content', async () => {
		const page = await browser.readDocument(testUrl);
		expect(page.title).toBe('Hello World!');
		expect(page.body.querySelector('#static')).toMatchObject({
			innerText: expect.stringContaining('Static Content!'),
		});
		expect(page.body.querySelector('#dynamic')).toMatchObject({
			innerText: expect.stringContaining('Dynamic Content!'),
		});
	});

	it('reads both static and dynamic content', async () => {
		const data = await browser.readMarkdown(testUrl);
		expect(data.title).toBe('Hello World!');
		expect(data.body).toContain('Static Content!');
		expect(data.body).toContain('Dynamic Content!');
	});
});
