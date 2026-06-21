import { useReducer } from 'react';

/**
 * @internal
 * Terminal Store Message.
 */
export interface TerminalMessage {
	type: 'model' | 'user' | 'error';
	text: string;
}

/**
 * @internal
 * Terminal Store Tool.
 */
export interface TerminalTool {
	name: string;
	args: unknown;
}

/**
 * @internal
 * Terminal Store Status.
 */
export const enum TerminalStatus {
	COLD = 'cold',
	DOWNLOADING = 'downloading',
	LOADING = 'loading',
	READY = 'ready',
	THINKING = 'thinking',
	EXITING = 'exiting',
}

/**
 * @internal
 * Terminal Store State.
 */
export interface TerminalState {
	status: TerminalStatus;
	downloadProgress: number;
	confirmation: string | null;
	activeTool: TerminalTool | null;
	activeMessage: TerminalMessage | null;
	history: Array<TerminalMessage>;
}

/**
 * @internal
 * Terminal Store Action.
 */
export type TerminalAction =
	| {
			type: 'modelLoad';
			data?: never;
	  }
	| {
			type: 'modelReady';
			data?: never;
	  }
	| {
			type: 'modelThink';
			data?: never;
	  }
	| {
			type: 'modelExiting';
			data?: never;
	  }
	| {
			type: 'modelDownload';
			data: { downloadProgress: number };
	  }
	| {
			type: 'historyPush';
			data: TerminalMessage;
	  }
	| {
			type: 'activeTool';
			data: TerminalTool | null;
	  }
	| {
			type: 'activeMessageAppend';
			data: string;
	  }
	| {
			type: 'activeMessageClear';
			data?: never;
	  }
	| {
			type: 'confirmRequest';
			data: string;
	  }
	| {
			type: 'confirmClear';
			data?: never;
	  };

/**
 * @internal
 * Terminal Initial State.
 */
export const TERMINAL_INITIAL_STATE = {
	status: TerminalStatus.COLD,
	downloadProgress: 0,
	confirmation: null,
	activeMessage: null,
	activeTool: null,
	history: [],
};

/**
 * @internal
 * Terminal Store.
 */
export const useTerminalStore = () => {
	const [state, dispatch] = useReducer<TerminalState, [TerminalAction]>(
		(prev, action) => {
			switch (action.type) {
				case 'modelLoad': {
					return {
						...prev,
						status: TerminalStatus.LOADING,
					};
				}
				case 'modelReady': {
					return {
						...prev,
						status: TerminalStatus.READY,
					};
				}
				case 'modelThink': {
					return {
						...prev,
						status: TerminalStatus.THINKING,
					};
				}
				case 'modelExiting': {
					return {
						...prev,
						status: TerminalStatus.EXITING,
					};
				}
				case 'modelDownload': {
					return {
						...prev,
						status: TerminalStatus.DOWNLOADING,
						downloadProgress: action.data.downloadProgress,
					};
				}
				case 'activeMessageAppend': {
					return {
						...prev,
						activeMessage: {
							type: 'model',
							text: (prev.activeMessage?.text ?? '') + action.data,
						},
					};
				}
				case 'activeMessageClear': {
					return {
						...prev,
						activeMessage: null,
					};
				}
				case 'activeTool': {
					return {
						...prev,
						activeTool: action.data,
					};
				}
				case 'historyPush': {
					return {
						...prev,
						history: [...prev.history, action.data],
					};
				}
				case 'confirmRequest': {
					return {
						...prev,
						confirmation: action.data,
					};
				}
				case 'confirmClear': {
					return {
						...prev,
						confirmation: null,
					};
				}
				default: {
					return prev;
				}
			}
		},
		TERMINAL_INITIAL_STATE,
	);
	return { state, dispatch };
};
