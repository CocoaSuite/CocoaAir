/** Present only inside the desktop app (see electron/preload.cjs). */
export interface DesktopBridge {
  info: {
    desktop: true;
    version: string;
    /** True when this PC runs the shared server for its network. */
    hosting: boolean;
    /** Another PC's server, when that PC hosts. Null means this page's own server. */
    signalingUrl: string | null;
    /** The address phones on this Wi-Fi open, or null with no network. */
    phoneUrl: string | null;
  };
  platform: string;
  setTheme: (theme: 'light' | 'dark') => void;
  attention: () => void;
}

export const desktop: DesktopBridge | undefined = (window as Window & { cocoaDesktop?: DesktopBridge }).cocoaDesktop;
