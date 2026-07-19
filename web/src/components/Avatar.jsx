import React from 'react';
import { colorFor, initials } from '../lib/format';

const PRESENCE = {
  online: 'bg-green-500',
  away: 'bg-amber-500',
  dnd: 'bg-red-500',
  offline: 'bg-slate-400',
};

export default function Avatar({ name = '', url, kind, presence, size = 40 }) {
  const px = { width: size, height: size };

  return (
    <div className="relative shrink-0" style={px}>
      {url ? (
        <img src={url} alt="" style={px} className="rounded-full object-cover" />
      ) : (
        <div
          style={{ ...px, backgroundColor: kind === 'channel' ? '#475569' : colorFor(name) }}
          className="flex items-center justify-center rounded-full font-semibold text-white"
          aria-hidden="true"
        >
          <span style={{ fontSize: size * 0.36 }}>{kind === 'channel' ? '#' : initials(name)}</span>
        </div>
      )}
      {presence && (
        <span
          className={`absolute bottom-0 right-0 rounded-full border-2 border-white dark:border-slate-900 ${PRESENCE[presence] || PRESENCE.offline}`}
          style={{ width: size * 0.28, height: size * 0.28 }}
          title={presence}
        />
      )}
    </div>
  );
}
