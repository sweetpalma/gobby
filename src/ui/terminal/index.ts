import { createElement as h, useEffect, useState, useRef } from 'react';
import { render as inkRender, Box, Text, useInput } from 'ink';
import { Spinner } from '@inkjs/ui';

import { Agent, AgentEvents, AgentAbort } from '../../agent';
import {
	TerminalMessage,
	TerminalMessageProps,
	TerminalConfirmationProps,
	TerminalConfirmation,
	TerminalProgress,
	TerminalHeader,
	TerminalInput,
	TerminalThemeProvider,
} from './components';

/**
 * Terminal Props.
 */
export interface TerminalProps {
	agent: Agent;
	initialPrompt?: string;
	maxWidth?: number;
}

/**
 * @internal
 * Terminal Model Status.
 */
export const enum TerminalStatus {
	COLD = 'cold',
	DOWNLOADING = 'downloading',
	LOADING = 'loading',
	READY = 'ready',
	THINKING = 'thinking',
}

/**
 * Terminal Entry Point.
 */
export const Terminal = ({ agent, initialPrompt, maxWidth }: TerminalProps) => {
	const [status, setStatus] = useState<TerminalStatus>(TerminalStatus.COLD);
	const [history, setHistory] = useState<Array<TerminalMessageProps>>([]);

	const [confirmation, setConfirmation] = useState<TerminalConfirmationProps>();
	const [downloadProgress, setDownloadProgress] = useState(0);

	const [activeMessage, setActiveMessage] = useState<TerminalMessageProps>();
	const [activeTool, setActiveTool] = useState<string>();

	const abortController = useRef(new AbortController());
	const isInteractive = !!process.stdin.isTTY;

	const handlePrompt = async (text: string, isInitialPrompt: boolean = false) => {
		if (text.trim().length === 0) {
			return;
		}
		try {
			setStatus(TerminalStatus.THINKING);
			abortController.current = new AbortController();
			if (!isInitialPrompt) {
				setHistory((current) => [...current, { type: 'user', text }]);
			}
			const response = await agent.prompt({
				text,
				signal: abortController.current.signal,
				onFunctionCall: handleFunction,
				onTextChunk: handleChunk,
			});
			setHistory((current) => [...current, { type: 'model', text: response.text }]);
		} catch (err) {
			if (err instanceof AgentAbort) {
				return;
			}
			handleError(err);
		} finally {
			setStatus(TerminalStatus.READY);
			setActiveTool(undefined);
			setActiveMessage(undefined);
		}
	};

	const handleError = (err: unknown) => {
		const message = err instanceof Error ? err.message : `${err}`;
		setHistory((current) => [...current, { type: 'error', text: message }]);
	};

	const handleChunk = (chunk: string) => {
		setActiveMessage((current) => ({
			type: 'model',
			text: (current?.text ?? '') + chunk,
		}));
	};

	const handleFunction = (name: string, args: unknown) => {
		setActiveTool(name);
	};

	const handleConfirm = (result: boolean) => {
		if (!confirmation) {
			return;
		}
		try {
			const { resolve } = confirmation;
			resolve(result);
		} finally {
			setConfirmation(undefined);
		}
	};

	// prettier-ignore
	useEffect(() => {
		type AgentListeners = {
			[K in keyof AgentEvents]?: (...args: AgentEvents[K]) => void;
		};
		const listeners: AgentListeners = {
			confirm: (text, resolve) => {
				setConfirmation({ text, resolve });
			},
			download: (pct) => {
				setStatus(TerminalStatus.DOWNLOADING);
				setDownloadProgress(pct);
			},
			downloadProgress: (pct) => {
				setDownloadProgress(pct);
			},
			load: () => {
				setStatus(TerminalStatus.LOADING);
			},
			loadComplete: () => {
				setStatus(TerminalStatus.READY);
				if (initialPrompt) {
					const isInitialPrompt = true;
					handlePrompt(initialPrompt, isInitialPrompt);
				}
			},
		};
		Object.keys(listeners).forEach((key) => {
			agent.on(key, listeners[key as keyof AgentListeners]!);
		});
		return () => {
			Object.keys(listeners).forEach((key) => {
				agent.off(key, listeners[key as keyof AgentListeners]!);
			});
		};
	}, [agent]);

	// prettier-ignore
	useInput(async (char, key) => {
		if (!key.ctrl || char !== 'c') {
			return;
		}
		if (status === TerminalStatus.THINKING) {
			abortController.current.abort();
		} else {
			await agent.dispose();
			process.exit(0);
		}
	}, {
		isActive: isInteractive,
	});

	// prettier-ignore
	return h(TerminalThemeProvider, {},
		h(Box, { flexDirection: 'column', gap: 1, maxWidth: maxWidth ?? 80 },
			status !== TerminalStatus.COLD && isInteractive &&
				h(TerminalHeader, {
					model: agent.config.get('modelPath'),
					memos: `${agent.memory.length}/${agent.memory.lengthLimit}`,
				}),
			history.map((msg, key) => 
				h(TerminalMessage, { key, ...msg }),
			),
			activeMessage && activeMessage.text.trim().length > 0 &&
				h(TerminalMessage, activeMessage),
			status === TerminalStatus.DOWNLOADING &&
				h(TerminalProgress, { value: downloadProgress }),
			status === TerminalStatus.LOADING &&
				h(Box, { gap: 1 },
					h(Spinner, { type: 'dots' }), 
					h(Text, { dimColor: true }, 'Warming up...')
				),
			status === TerminalStatus.THINKING && !confirmation && !activeTool &&
				h(Box, { gap: 1 },
					h(Spinner, { type: 'dots' }), 
					h(Text, { dimColor: true }, 'Thinking...')
				),
			status === TerminalStatus.THINKING && !confirmation && activeTool &&
				h(Box, { gap: 1 },
					h(Spinner, { type: 'dots' }), 
					h(Text, { dimColor: true }, `Using "${activeTool}"...`)
				),
			status === TerminalStatus.THINKING && confirmation &&
				h(TerminalConfirmation, {
					text: confirmation.text,
					resolve: handleConfirm,
				}),
			status === TerminalStatus.READY && isInteractive &&
				h(TerminalInput, {
					onSubmit: handlePrompt, 
				}),
		),
	);
};

/**
 * Starts terminal rendering session.
 */
export const render = (opts: TerminalProps) => {
	const instance = inkRender(h(Terminal, opts), { exitOnCtrlC: false });
	return instance;
};
