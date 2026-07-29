import { describe, it, expect } from 'vitest';
import { analyze } from './shell';

describe('Shell (Utils)', () => {
	describe('analyze', () => {
		it('supports simple calls', () => {
			expect(analyze('echo "Hello World!"')).toMatchObject({
				redirects: [],
				calls: [{ name: 'echo', args: ['Hello World!'] }],
			});
			expect(analyze('echo $((RANDOM % 6 + 1))')).toMatchObject({
				redirects: [],
				calls: [{ name: 'echo', args: ['$((RANDOM % 6 + 1))'] }],
			});
			expect(analyze('git status')).toMatchObject({
				redirects: [],
				calls: [{ name: 'git', args: ['status'] }],
			});
			expect(analyze('ls -a')).toMatchObject({
				redirects: [],
				calls: [{ name: 'ls', args: ['-a'] }],
			});
			expect(analyze('rm -rf')).toMatchObject({
				redirects: [],
				calls: [{ name: 'rm', args: ['-rf'] }],
			});
		});

		it('supports piping syntax', () => {
			expect(analyze('cat test.txt | tail -n 10')).toMatchObject({
				redirects: [],
				calls: [
					{ name: 'cat', args: ['test.txt'] },
					{ name: 'tail', args: ['-n', '10'] },
				],
			});
			expect(analyze('find . -name "*.ts" | wc -l')).toMatchObject({
				redirects: [],
				calls: [
					{ name: 'find', args: ['.', '-name', '*.ts'] },
					{ name: 'wc', args: ['-l'] },
				],
			});
		});

		it('supports chaining syntax', () => {
			expect(analyze('git status && git diff')).toMatchObject({
				redirects: [],
				calls: [
					{ name: 'git', args: ['status'] },
					{ name: 'git', args: ['diff'] },
				],
			});
			expect(analyze('git status || git diff')).toMatchObject({
				redirects: [],
				calls: [
					{ name: 'git', args: ['status'] },
					{ name: 'git', args: ['diff'] },
				],
			});
		});

		it('supports function syntax', () => {
			expect(analyze('f() { rm -rf /; }; f')).toMatchObject({
				redirects: [],
				calls: [
					{ name: 'rm', args: ['-rf', '/'] },
					{ name: 'f', args: [] },
				],
			});
		});

		it('supports redirect syntax', () => {
			expect(analyze('echo foo > ~/.bashrc')).toMatchObject({
				redirects: [{ operator: '>', target: '~/.bashrc' }],
				calls: [{ name: 'echo', args: ['foo'] }],
			});
			expect(analyze('cat <<EOF\nrm -rf ~\nEOF')).toMatchObject({
				redirects: [{ operator: '<<', target: 'EOF' }],
				calls: [{ name: 'cat', args: [] }],
			});
		});

		it('supports substitution syntax', () => {
			expect(analyze('echo $(rm -rf /)')).toMatchObject({
				redirects: [],
				calls: [
					{ name: 'rm', args: ['-rf', '/'] },
					{ name: 'echo', args: ['$(rm -rf /)'] },
				],
			});
			expect(analyze('echo "$(rm -rf /)"')).toMatchObject({
				redirects: [],
				calls: [
					{ name: 'rm', args: ['-rf', '/'] },
					{ name: 'echo', args: ['$(rm -rf /)'] },
				],
			});
			expect(analyze('echo `rm -rf /`')).toMatchObject({
				redirects: [],
				calls: [
					{ name: 'rm', args: ['-rf', '/'] },
					{ name: 'echo', args: ['`rm -rf /`'] },
				],
			});
			expect(analyze('VAR=$(rm -rf /) echo hi')).toMatchObject({
				redirects: [],
				calls: [
					{ name: 'rm', args: ['-rf', '/'] },
					{ name: 'echo', args: ['hi'] },
				],
			});
			expect(analyze('<(rm -rf /) /')).toMatchObject({
				redirects: [],
				calls: [
					{ name: 'rm', args: ['-rf', '/'] },
					{ name: '<(rm -rf /)', args: ['/'] },
				],
			});
			expect(analyze('>(rm -rf /)')).toMatchObject({
				redirects: [],
				calls: [
					{ name: 'rm', args: ['-rf', '/'] },
					{ name: '>(rm -rf /)', args: [] },
				],
			});
		});
	});
});
