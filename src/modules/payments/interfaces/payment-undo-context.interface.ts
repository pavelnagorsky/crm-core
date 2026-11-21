/** Facts beyond the operation that decide whether its author may undo it. */
export interface PaymentUndoContext {
  /** User asking for the undo; undefined for an actor without a user. */
  actorId: string | undefined;
  /** The order has active refunds. */
  hasActiveRefunds: boolean;
  now: Date;
}
