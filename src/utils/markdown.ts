import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';

marked.setOptions({
	renderer: new TerminalRenderer(),
});

/**
 * Renders given Markdown string as ASCII.
 */
export const render = (text: string) => {
	return marked.parse(text);
};
