import type { DeviceInfo } from '../../shared/protocol';

/** Works out what kind of device this is, for the icon and label other devices show. */
export function detectDevice(nav: Pick<Navigator, 'userAgent' | 'maxTouchPoints'> = navigator): DeviceInfo {
  const ua = nav.userAgent;
  // iPadOS reports itself as a Mac; touch support gives it away.
  const iPadAsMac = /Macintosh/.test(ua) && nav.maxTouchPoints > 1;

  let os = 'Unknown';
  let kind: DeviceInfo['kind'] = 'desktop';
  if (/iPhone|iPod/.test(ua)) {
    os = 'iPhone';
    kind = 'phone';
  } else if (/iPad/.test(ua) || iPadAsMac) {
    os = 'iPad';
    kind = 'tablet';
  } else if (/Android/.test(ua)) {
    os = 'Android';
    kind = /Mobile/.test(ua) ? 'phone' : 'tablet';
  } else if (/Windows/.test(ua)) os = 'Windows';
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Macintosh/.test(ua)) os = 'Mac';
  else if (/Linux/.test(ua)) os = 'Linux';

  let browser = 'Browser';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/OPR\//.test(ua)) browser = 'Opera';
  else if (/SamsungBrowser/.test(ua)) browser = 'Samsung Internet';
  else if (/Firefox|FxiOS/.test(ua)) browser = 'Firefox';
  else if (/Chrome|CriOS/.test(ua)) browser = 'Chrome';
  else if (/Safari/.test(ua)) browser = 'Safari';

  return { kind, os, browser };
}

export function deviceLabel(d: Pick<DeviceInfo, 'os' | 'browser' | 'kind'>): string {
  const what = d.os === 'Unknown' ? (d.kind === 'phone' ? 'Phone' : d.kind === 'tablet' ? 'Tablet' : 'Computer') : d.os;
  return `${what}, ${d.browser}`;
}
