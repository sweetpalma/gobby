import { createElement as h, useEffect, useRef } from 'react';
import { render as inkRender, Box, Text, useInput } from 'ink';
import { Spinner } from '@inkjs/ui';

import { Agent, AgentEvents, AgentAbort } from '../../agent';
import { TerminalStatus, useTerminalStore } from './store';
import {
	TerminalMessage,
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
 * Terminal Entry Point.
 */
export const Terminal = ({ agent, initialPrompt, maxWidth }: TerminalProps) => {
	const { state, dispatch } = useTerminalStore();
	const confirmCallback = useRef<(result: boolean) => void | null>(null);
	const abortController = useRef<AbortController>(new AbortController());
	const isInteractive = !!process.stdin.isTTY;

	const handlePrompt = async (text: string, isInitialPrompt: boolean = false) => {
		if (text.trim().length === 0) {
			return;
		}
		try {
			dispatch({ type: 'modelThink' });
			abortController.current = new AbortController();
			if (!isInitialPrompt) {
				dispatch({
					type: 'historyPush',
					data: { type: 'user', text },
				});
			}
			const response = await agent.prompt({
				text,
				signal: abortController.current.signal,
				onFunctionCall: handleFunction,
				onTextChunk: handleChunk,
			});
			dispatch({
				type: 'historyPush',
				data: { type: 'model', text: response.text },
			});
		} catch (err) {
			if (!(err instanceof AgentAbort)) {
				handleError(err);
			}
		} finally {
			dispatch({ type: 'modelReady' });
			dispatch({ type: 'activeTool', data: null });
			dispatch({ type: 'activeMessageClear' });
		}
	};

	const handleError = (err: unknown) => {
		const text = err instanceof Error ? err.message : `${err}`;
		dispatch({
			type: 'historyPush',
			data: { type: 'error', text },
		});
	};

	const handleChunk = (chunk: string) => {
		dispatch({
			type: 'activeMessageAppend',
			data: chunk,
		});
	};

	const handleFunction = (name: string, args: unknown) => {
		dispatch({ type: 'activeTool', data: { name, args } });
	};

	const handleConfirm = (result: boolean) => {
		confirmCallback.current?.call(null, result);
		confirmCallback.current = null;
		dispatch({ type: 'confirmClear' });
	};

	// prettier-ignore
	useEffect(() => {
		type AgentListeners = {
			[K in keyof AgentEvents]?: (...args: AgentEvents[K]) => void;
		};
		const listeners: AgentListeners = {
			confirm: (text, resolve) => {
				confirmCallback.current = resolve;
				dispatch({ type: 'confirmRequest', data: text });
			},
			download: (downloadProgress) => {
				dispatch({ type: 'modelDownload', data: { downloadProgress } });
			},
			downloadProgress: (downloadProgress) => {
				dispatch({ type: 'modelDownload', data: { downloadProgress } });
			},
			load: () => {
				dispatch({ type: 'modelLoad' });
			},
			loadComplete: () => {
				dispatch({ type: 'modelReady' });
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
	useInput((char, key) => {
		const exitGracefully = () => {
			dispatch({ type: 'modelExiting' });
			agent.dispose()
				.catch(() => process.exit(0))
				.then(() => process.exit(0));
		};
		if (key.ctrl && char === 'd') {
			exitGracefully();
		}
		if (key.ctrl && char === 'c') {
			if (state.status === TerminalStatus.THINKING) {
				abortController.current.abort();
			} else {
				exitGracefully();
			}
		}
	}, {
		isActive: isInteractive,
	});

	// prettier-ignore
	return h(TerminalThemeProvider, {},
		h(Box, { flexDirection: 'column', gap: 1, maxWidth: maxWidth ?? 80 },
			state.status !== TerminalStatus.COLD && isInteractive &&
				h(TerminalHeader, {
					model: agent.config.get('modelPath'),
					memos: `${agent.memory.length}/${agent.memory.lengthLimit}`,
				}),
			state.history.map((msg, key) => 
				h(TerminalMessage, { key, ...msg }),
			),
			state.activeMessage && state.activeMessage.text.trim().length > 0 &&
				h(TerminalMessage, state.activeMessage),
			state.status === TerminalStatus.DOWNLOADING &&
				h(TerminalProgress, { value: state.downloadProgress }),
			state.status === TerminalStatus.LOADING &&
				h(Box, { gap: 1 },
					h(Spinner, { type: 'dots' }), 
					h(Text, { dimColor: true }, 'Warming up...')
				),
			state.status === TerminalStatus.EXITING &&
				h(Box, { gap: 1 },
					h(Spinner, { type: 'dots' }), 
					h(Text, { dimColor: true }, 'Exiting...')
				),
			state.status === TerminalStatus.THINKING && !state.confirmation && !state.activeTool &&
				h(Box, { gap: 1 },
					h(Spinner, { type: 'dots' }), 
					h(Text, { dimColor: true }, 'Thinking...')
				),
			state.status === TerminalStatus.THINKING && !state.confirmation && state.activeTool &&
				h(Box, { gap: 1 },
					h(Spinner, { type: 'dots' }), 
					h(Text, { dimColor: true }, `Using "${state.activeTool.name}"...`)
				),
			state.status === TerminalStatus.THINKING && state.confirmation &&
				h(TerminalConfirmation, {
					text: state.confirmation,
					resolve: handleConfirm,
				}),
			state.status === TerminalStatus.READY && isInteractive &&
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
