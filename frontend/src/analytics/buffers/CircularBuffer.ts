export class CircularBuffer<T> {
  private buffer: (T | null)[];
  private head: number = 0;
  private tail: number = 0;
  private count: number = 0;

  constructor(private maxSize: number) {
    this.buffer = new Array(maxSize).fill(null);
  }

  push(item: T): void {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.maxSize;

    if (this.count < this.maxSize) {
      this.count++;
    } else {
      this.tail = (this.tail + 1) % this.maxSize;
    }
  }

  get(index: number): T | null {
    if (index < 0 || index >= this.count) return null;
    const actualIndex = (this.tail + index) % this.maxSize;
    return this.buffer[actualIndex];
  }

  getLatest(): T | null {
    if (this.count === 0) return null;
    const index = (this.head - 1 + this.maxSize) % this.maxSize;
    return this.buffer[index];
  }

  toArray(): T[] {
    const result: T[] = [];
    for (let i = 0; i < this.count; i++) {
      const item = this.get(i);
      if (item !== null) result.push(item);
    }
    return result;
  }

  clear(): void {
    this.buffer = new Array(this.maxSize).fill(null);
    this.head = 0;
    this.tail = 0;
    this.count = 0;
  }

  get length(): number {
    return this.count;
  }

  get capacity(): number {
    return this.maxSize;
  }

  isFull(): boolean {
    return this.count === this.maxSize;
  }
}
