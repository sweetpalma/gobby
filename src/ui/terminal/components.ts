import { createElement as h, ReactNode } from 'react';
import { Text, Box } from 'ink';
import {
	TextInput,
	ConfirmInput,
	ProgressBar,
	ThemeProvider,
	extendTheme,
	defaultTheme,
} from '@inkjs/ui';

import { version } from '../../../package.json';
import { render } from '../../utils/markdown';

/**
 * Terminal Theme.
 * Used by InkUI components.
 */
const theme = extendTheme(defaultTheme, {
	components: {
		Spinner: {
			styles: {
				frame: () => ({ color: 'green' }),
			},
		},
		ProgressBar: {
			styles: {
				completed: () => ({ color: 'green' }),
			},
			config: () => ({
				completedCharacter: '■',
				remainingCharacter: ' ',
			}),
		},
	},
});

/**
 * Terminal Theme Provider Props.
 */
export interface TerminalTheme {
	children?: ReactNode;
}

/**
 * Terminal Theme Provider.
 */
export const TerminalThemeProvider = ({ children }: TerminalTheme) => {
	return h(ThemeProvider, { theme, children });
};

/**
 * Terminal Header Props.
 */
export interface TerminalHeaderProps {
	model: string;
	memos: string;
}

/**
 * Terminal Header.
 */
export const TerminalHeader = ({ model, memos }: TerminalHeaderProps) => {
	// prettier-ignore
	return h(Box, { gap: 2, },
		h(Box, { flexDirection: 'column' },
			h(Text, { color: 'green' }, ' ▄▄ ▄██████▄ ▄▄ '),
			h(Text, { color: 'green' }, '  ▀███ ██ ███▀  '),
			h(Text, { color: 'green' }, '    ▀██████▀    '),
		),
		h(Box, { flexDirection: 'column' },
			h(Text, {}, `Gobby Agent v${version}`),
			h(Text, { dimColor: true }, `Brain : ${model}`),
			h(Text, { dimColor: true }, `Memos : ${memos}`),
		),
	);
};

/**
 * Terminal Progress Bar Props.
 */
export interface TerminalProgress {
	value: number;
}

/**
 * Terminal Progress Bar.
 */
export const TerminalProgress = ({ value }: TerminalProgress) => {
	// prettier-ignore
	return h(Box, { flexDirection: 'column' },
		h(Text, {}, 'Brain missing!'),
		h(Text, { dimColor: true }, 'Scavenging Hugging Face for a new one...'),
		h(Box, { gap: 1, maxWidth: 50 },
			h(ProgressBar, { value }),
			h(Text, { dimColor: true }, '|'),
			h(Text, { dimColor: true }, `${value}%`),
		),
	);
};

/**
 * Terminal Message Props.
 */
export interface TerminalMessageProps {
	type: 'model' | 'user' | 'error';
	text: string;
}

/**
 * Terminal Message.
 */
export const TerminalMessage = ({ type, text }: TerminalMessageProps) => {
	const config: Record<TerminalMessageProps['type'], { color: string; title: string }> = {
		model: {
			color: 'green',
			title: '◆ Gobby',
		},
		user: {
			color: 'white',
			title: '● Human',
		},
		error: {
			color: 'red',
			title: '■ Error',
		},
	};
	// prettier-ignore
	return h(Box, { flexDirection: 'column' }, 
		h(Text, { color: config[type].color }, config[type].title ), 
		h(Box, {},
			h(Box, { width: 2, flexShrink: 0 }, h(Text, { dimColor: true }, '└')),
			h(Text, {}, render(text).trim()),
		),
	);
};

/**
 * Terminal Input Props.
 */
export interface TerminalInputProps {
	onSubmit?: (input: string) => void;
}

/**
 * Terminal Input.
 */
export const TerminalInput = ({ onSubmit }: TerminalInputProps) => {
	// prettier-ignore
	return h(Box, { flexDirection: 'column' }, 
		h(Text, {}, '● Human'), 
		h(Box, {},
			h(Box, { width: 2, flexShrink: 0 }, h(Text, { dimColor: true }, '└')),
			h(TextInput, {
				placeholder: 'User prompt...', 
				onSubmit,
			}),
		),
	);
};

/**
 * Terminal Confirmation Props.
 */
export interface TerminalConfirmationProps {
	text: string;
	resolve: (result: boolean) => void;
}

/**
 * Terminal Confirmation.
 */
export const TerminalConfirmation = ({ text, resolve }: TerminalConfirmationProps) => {
	// prettier-ignore
	return h(Box, { flexDirection: 'column', },
		h(Text, {}, `$ ${text}`),
		h(Box, { gap: 1 },
			h(Box, { width: 1, }),
			h(Text, {}, 'Confirm?'),
			h(ConfirmInput, {
				onConfirm: () => resolve(true),
				onCancel: () => resolve(false),
			}),
		),
	)
};
