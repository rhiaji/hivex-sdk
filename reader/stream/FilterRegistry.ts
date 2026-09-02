import type {
  CustomJsonFilter,
  PaymentFilter,
  StreamEvent,
  StreamHandler,
  StreamSubscription,
} from "./types";

/**
 * Stores stream subscriptions. It never opens a blockchain connection — the
 * StreamEngine owns the single block reader and asks the registry who to call.
 */
export class FilterRegistry {
  private readonly customJsonFilters = new Set<CustomJsonFilter<never>>();
  private readonly paymentFilters = new Set<PaymentFilter<never>>();
  private readonly eventHandlers = new Set<StreamHandler<StreamEvent>>();

  addCustomJson<T>(filter: CustomJsonFilter<T>): StreamSubscription {
    const entry = filter as unknown as CustomJsonFilter<never>;
    this.customJsonFilters.add(entry);
    return subscription(() => this.customJsonFilters.delete(entry));
  }

  addPayment<T>(filter: PaymentFilter<T>): StreamSubscription {
    const entry = filter as unknown as PaymentFilter<never>;
    this.paymentFilters.add(entry);
    return subscription(() => this.paymentFilters.delete(entry));
  }

  addEventHandler(handler: StreamHandler<StreamEvent>): StreamSubscription {
    this.eventHandlers.add(handler);
    return subscription(() => this.eventHandlers.delete(handler));
  }

  customJson(): CustomJsonFilter<Record<string, unknown>>[] {
    return [...this.customJsonFilters] as unknown as CustomJsonFilter<Record<string, unknown>>[];
  }

  payments(): PaymentFilter<unknown>[] {
    return [...this.paymentFilters] as unknown as PaymentFilter<unknown>[];
  }

  events(): StreamHandler<StreamEvent>[] {
    return [...this.eventHandlers];
  }

  /** Total number of registered subscriptions, universal handlers included. */
  size(): number {
    return (
      this.customJsonFilters.size +
      this.paymentFilters.size +
      this.eventHandlers.size
    );
  }

  clear(): void {
    this.customJsonFilters.clear();
    this.paymentFilters.clear();
    this.eventHandlers.clear();
  }
}

function subscription(remove: () => void): StreamSubscription {
  const unsubscribe = () => {
    remove();
  };
  return Object.assign(unsubscribe, { unsubscribe });
}
