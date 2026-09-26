import type { DomainEvent, DomainEventType, EventOfType } from "./domain-event";

/** Handler for one event type. */
export type EventHandler<T extends DomainEventType> = (event: EventOfType<T>) => void;

/** Call to remove a subscription. */
export type Unsubscribe = () => void;

/**
 * Synchronous, typed event bus port (REQUIREMENTS §2.3/§2.4).
 *
 * Semantics (the fixed-step loop depends on them):
 * - `publish` only **queues** the event. Nothing is delivered until `flush`.
 * - `flush` delivers queued events in FIFO order, synchronously. Events published by
 *   handlers during a flush are delivered in the **same** flush, after the ones already
 *   queued. The loop calls `flush` once, as the last step of every fixed step.
 * - Handlers must not throw; an exception aborts the flush and propagates.
 */
export interface EventBus {
  publish(event: DomainEvent): void;
  subscribe<T extends DomainEventType>(type: T, handler: EventHandler<T>): Unsubscribe;
  /** Receives every event (used by presentation for "recent events", by logging, …). */
  subscribeAll(handler: (event: DomainEvent) => void): Unsubscribe;
  flush(): void;
}

/** Guards against handlers that keep publishing forever. */
const MAX_EVENTS_PER_FLUSH = 10_000;

/** In-memory implementation of the `EventBus` port. */
export class InMemoryEventBus implements EventBus {
  private queue: DomainEvent[] = [];
  private readonly byType = new Map<DomainEventType, Set<(event: DomainEvent) => void>>();
  private readonly all = new Set<(event: DomainEvent) => void>();

  publish(event: DomainEvent): void {
    this.queue.push(event);
  }

  subscribe<T extends DomainEventType>(type: T, handler: EventHandler<T>): Unsubscribe {
    // Safe: dispatch only calls this wrapper with events whose `type` is `T`.
    const wrapped = (event: DomainEvent): void => {
      if (event.type === type) handler(event as EventOfType<T>);
    };
    let set = this.byType.get(type);
    if (set === undefined) {
      set = new Set();
      this.byType.set(type, set);
    }
    set.add(wrapped);
    const owner = set;
    return () => {
      owner.delete(wrapped);
    };
  }

  subscribeAll(handler: (event: DomainEvent) => void): Unsubscribe {
    this.all.add(handler);
    return () => {
      this.all.delete(handler);
    };
  }

  flush(): void {
    let delivered = 0;
    while (this.queue.length > 0) {
      const batch = this.queue;
      this.queue = [];
      for (const event of batch) {
        delivered += 1;
        if (delivered > MAX_EVENTS_PER_FLUSH) {
          throw new Error(`EventBus.flush exceeded ${MAX_EVENTS_PER_FLUSH} events (publish loop?)`);
        }
        const handlers = this.byType.get(event.type);
        if (handlers !== undefined) {
          for (const handler of [...handlers]) handler(event);
        }
        for (const handler of [...this.all]) handler(event);
      }
    }
  }
}
