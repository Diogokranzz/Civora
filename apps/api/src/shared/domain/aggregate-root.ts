export interface DomainEvent<TPayload = Record<string, unknown>> {
  readonly eventId: string;
  readonly eventType: string;
  readonly eventVersion: number;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly tenantId: string;
  readonly occurredAt: Date;
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly payload: TPayload;
}

export abstract class AggregateRoot {
  private readonly uncommittedEvents: DomainEvent[] = [];

  protected constructor(
    public readonly id: string,
    protected _version: number = 1,
  ) {}

  get version(): number {
    return this._version;
  }

  protected addDomainEvent(event: DomainEvent): void {
    this.uncommittedEvents.push(event);
  }

  pullDomainEvents(): DomainEvent[] {
    const events = [...this.uncommittedEvents];
    this.uncommittedEvents.length = 0;
    return events;
  }
}

