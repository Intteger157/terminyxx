import { useEffect } from 'react';
import { EventsOn } from '../../wailsjs/runtime/runtime';

export function useWailsEvent<T = unknown>(
  eventName: string,
  handler: (data: T) => void,
  deps: unknown[] = []
) {
  useEffect(() => {
    const unsubscribe = EventsOn(eventName, handler);
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, deps);
}
