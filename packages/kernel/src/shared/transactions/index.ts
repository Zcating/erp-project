export type TransactionContext = {
  readonly transactionId: string;
  readonly handle: unknown;
};

export type TransactionRunner = {
  run<T>(work: (context: TransactionContext) => Promise<T>): Promise<T>;
};

export function createInMemoryTransactionRunner(): TransactionRunner {
  return {
    async run<T>(work: (context: TransactionContext) => Promise<T>): Promise<T> {
      return work({ transactionId: "in-memory", handle: undefined });
    },
  };
}
