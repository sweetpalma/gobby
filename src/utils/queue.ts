export class Queue<T> {
	private queue: Array<T> = [];
	private resolve: (() => void) | null = null;
	private done = false;

	push(item: T) {
		if (this.done) return;
		this.queue.push(item);
		if (this.resolve) {
			this.resolve();
			this.resolve = null;
		}
	}

	close() {
		this.done = true;
		if (this.resolve) {
			this.resolve();
			this.resolve = null;
		}
	}

	async *[Symbol.asyncIterator]() {
		while (!this.done || this.queue.length > 0) {
			if (this.queue.length > 0) {
				yield this.queue.shift()!;
			} else {
				await new Promise<void>((res) => {
					this.resolve = res;
				});
			}
		}
	}
}
