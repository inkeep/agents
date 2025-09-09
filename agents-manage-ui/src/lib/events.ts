type EventMap = {
	nodeAdded: { nodeId: string };
	edgeConnected: { edgeId: string };
	graphSaved: { id: string };
};

type Listener<T> = (payload: T) => void;
type EventKey = keyof EventMap;

export class EventBus {
	private listeners = new Map<EventKey, Function[]>();

	on<K extends EventKey>(event: K, listener: Listener<EventMap[K]>) {
		const arr = this.listeners.get(event) ?? [];
		arr.push(listener as any);
		this.listeners.set(event, arr);
		return () => this.off(event, listener);
	}

	off<K extends EventKey>(event: K, listener: Listener<EventMap[K]>) {
		const arr = this.listeners.get(event);
		if (!arr) return;
		const filtered = arr.filter((l) => l !== (listener as any));
		this.listeners.set(event, filtered);
	}

	emit<K extends EventKey>(event: K, payload: EventMap[K]) {
		const arr = this.listeners.get(event);
		if (!arr) return;
		for (const l of arr) (l as Listener<EventMap[K]>)(payload);
	}
}

export const eventBus = new EventBus();
