import { TransactionContext } from "./transaction-context";
export interface UnitOfWork {
  run<T>(work: (context: TransactionContext) => Promise<T>): Promise<T>;
}
export const UNIT_OF_WORK = Symbol("UnitOfWork");
