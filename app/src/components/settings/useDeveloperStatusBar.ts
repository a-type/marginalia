import { useLocalStorage } from '@a-type/ui';

export function useDeveloperStatusBar() {
  return useLocalStorage('margins:developer-status-bar', false);
}
