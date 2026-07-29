import { parse, Script, Command, Redirect, Statement } from 'unbash';

/**
 * Shell call.
 */
export interface ShellCall {
	name: string;
	args: Array<string>;
}

/**
 * Shell Redirect.
 */
export interface ShellRedirect {
	operator: string;
	target?: string;
}

/**
 * Traces the shell script, analysing it for command calls and redirects.
 * @param script - Shell script to parse.
 * @returns List of found redirects and command calls.
 */
export const analyze = (script: string) => {
	const redirects: Array<ShellRedirect> = [];
	const calls: Array<ShellCall> = [];
	const walk = (node: unknown) => {
		if (!node || typeof node !== 'object') {
			return;
		}
		Object.values(node).forEach((nodeChild) => {
			if (Array.isArray(nodeChild)) {
				nodeChild.forEach((sub) => walk(sub));
			} else if (typeof nodeChild === 'object') {
				walk(nodeChild);
			}
		});
		if ('type' in node && node.type === 'Statement') {
			const statement = node as Statement;
			statement.redirects.forEach((redirect: Redirect) => {
				redirects.push({
					operator: redirect.operator,
					target: redirect.target?.value,
				});
			});
		}
		if ('type' in node && node.type === 'Command') {
			const command = node as Command;
			if (command.name) {
				calls.push({
					name: command.name.value,
					args: command.suffix.map((word) => word.value),
				});
			}
			command.redirects.forEach((redirect: Redirect) => {
				redirects.push({
					operator: redirect.operator,
					target: redirect.target?.value,
				});
			});
		}
	};
	walk(JSON.parse(JSON.stringify(parse(script))));
	return { calls, redirects };
};
