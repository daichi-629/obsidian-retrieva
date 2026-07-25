/** Serializes conflicting writes to the same card path across write use-cases. */
export class CardWriteLock {
  private readonly writing = new Set<string>();

  async run<T>(path: string, operation: () => Promise<T>): Promise<T> {
    if (this.writing.has(path)) throw new Error("This card is already being updated");
    this.writing.add(path);
    try {
      return await operation();
    } finally {
      this.writing.delete(path);
    }
  }
}
