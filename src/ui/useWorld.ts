import { useSyncExternalStore } from 'react';
import { getVersion, getWorld, subscribe } from '../sim/store';
export function useWorld() {
  useSyncExternalStore(subscribe, getVersion);
  return getWorld();
}
