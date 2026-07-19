import { useState, useEffect } from 'react';

export const useDeviceDetect = () => {
  const [device, setDevice] = useState({ isMobile: false, os: 'unknown' });

  useEffect(() => {
    const ua = navigator.userAgent;
    const isAndroid = /Android/i.test(ua);
    const isIos = /iPhone|iPad|iPod/i.test(ua) || (ua.includes('Mac') && navigator.maxTouchPoints > 1);
    const isWindows = /Windows NT/i.test(ua);
    const isMac = /Macintosh|Mac OS X/i.test(ua) && !isIos;
    const isLinux = /Linux/i.test(ua) && !isAndroid;

    let os = 'unknown';
    if (isAndroid) os = 'android';
    else if (isIos) os = 'ios';
    else if (isWindows) os = 'windows';
    else if (isMac) os = 'macos';
    else if (isLinux) os = 'linux';

    setDevice({
      isMobile: isAndroid || isIos,
      os
    });
  }, []);

  return device;
};
