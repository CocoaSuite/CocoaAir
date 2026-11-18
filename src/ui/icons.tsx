import type { JSX } from 'preact';
import type { DeviceKind } from '../../shared/protocol';
import type { FileKind } from './actions';

type P = { size?: number; class?: string };

function Svg({ size = 16, class: cls, children, sw = 1.8 }: P & { children: JSX.Element | JSX.Element[]; sw?: number }) {
  return (
    <svg
      class={cls}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={sw}
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const Phone = (p: P) => (
  <Svg {...p}>
    <rect x="6" y="2.5" width="12" height="19" rx="3" />
    <path d="M10.5 18.5h3" />
  </Svg>
);
export const Tablet = (p: P) => (
  <Svg {...p}>
    <rect x="4" y="2.5" width="16" height="19" rx="2.5" />
    <path d="M10.5 18.5h3" />
  </Svg>
);
export const Monitor = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="4.5" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16.5V20" />
  </Svg>
);
export const DeviceIcon = ({ kind, ...p }: P & { kind: DeviceKind }) =>
  kind === 'phone' ? <Phone {...p} /> : kind === 'tablet' ? <Tablet {...p} /> : <Monitor {...p} />;

export const Wifi = (p: P) => (
  <Svg {...p} sw={2}>
    <path d="M5 12.5a10 10 0 0 1 14 0" />
    <path d="M8.5 16a5 5 0 0 1 7 0" />
    <circle cx="12" cy="19.5" r="0.8" fill="currentColor" />
  </Svg>
);
export const Globe = (p: P) => (
  <Svg {...p} sw={2}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  </Svg>
);
export const Relay = (p: P) => (
  <Svg {...p} sw={2}>
    <path d="M4 12h5l3-6 3 12 3-6h2" />
  </Svg>
);
export const Lock = (p: P) => (
  <Svg {...p} sw={2}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Svg>
);
export const Upload = (p: P) => (
  <Svg {...p}>
    <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" />
    <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </Svg>
);
export const Download = (p: P) => (
  <Svg {...p}>
    <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" />
    <path d="M4 17v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1" />
  </Svg>
);
export const Share = (p: P) => (
  <Svg {...p} sw={2}>
    <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" />
    <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
  </Svg>
);
export const Copy = (p: P) => (
  <Svg {...p} sw={2}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V6a2 2 0 0 1 2-2h8" />
  </Svg>
);
export const Message = (p: P) => (
  <Svg {...p}>
    <path d="M4 5h16v11H9l-5 4z" />
    <path d="M8 9.5h8M8 12.5h5" />
  </Svg>
);
export const Image = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="2" />
    <path d="M21 16l-5-5-9 9" />
  </Svg>
);
export const Video = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="5" width="14" height="14" rx="2" />
    <path d="M17 10l4-2.5v9L17 14" />
  </Svg>
);
export const Music = (p: P) => (
  <Svg {...p}>
    <path d="M9 18V5l11-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="17" cy="16" r="3" />
  </Svg>
);
export const FileDoc = (p: P) => (
  <Svg {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </Svg>
);
export const Archive = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="5" rx="1" />
    <path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4" />
  </Svg>
);
export const KindIcon = ({ kind, ...p }: P & { kind: FileKind }) =>
  kind === 'image' ? (
    <Image {...p} />
  ) : kind === 'video' ? (
    <Video {...p} />
  ) : kind === 'audio' ? (
    <Music {...p} />
  ) : kind === 'archive' ? (
    <Archive {...p} />
  ) : (
    <FileDoc {...p} />
  );
export const Folder = (p: P) => (
  <Svg {...p} sw={2}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Svg>
);
export const Back = (p: P) => (
  <Svg {...p} sw={2}>
    <path d="M15 18l-6-6 6-6" />
  </Svg>
);
export const Check = (p: P) => (
  <Svg {...p} sw={2.4}>
    <path d="M5 12l5 5 9-10" />
  </Svg>
);
export const Close = (p: P) => (
  <Svg {...p} sw={2}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const Moon = (p: P) => (
  <Svg {...p}>
    <path d="M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5a6.6 6.6 0 0 0 9.7 9.7z" />
  </Svg>
);
export const Sun = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </Svg>
);
export const Pencil = (p: P) => (
  <Svg {...p}>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
    <path d="M13.5 6.5l4 4" />
  </Svg>
);
export const SendUp = (p: P) => (
  <Svg {...p} sw={2}>
    <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
  </Svg>
);
export const Camera = (p: P) => (
  <Svg {...p} sw={2}>
    <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
    <path d="M4 12h16" />
  </Svg>
);
export const Leave = (p: P) => (
  <Svg {...p} sw={2}>
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10" />
  </Svg>
);
