import type { DesktopApi } from '@catalog/contracts';

declare global {
  interface Window {
    catalog: DesktopApi;
  }
}
