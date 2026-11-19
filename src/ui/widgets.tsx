import type { CSSProperties, ReactNode } from 'react';

/** 단순한 도형으로 그린 아이콘 세트 (24×24, currentColor). 이모지 폰트에 기대지 않는다. */
const ICONS: Record<string, ReactNode> = {
  paw: (
    <>
      <ellipse cx="12" cy="15.5" rx="5" ry="4.2" />
      <ellipse cx="5.6" cy="10" rx="2" ry="2.6" />
      <ellipse cx="9.6" cy="6.2" rx="2" ry="2.7" />
      <ellipse cx="14.4" cy="6.2" rx="2" ry="2.7" />
      <ellipse cx="18.4" cy="10" rx="2" ry="2.6" />
    </>
  ),
  meal: (
    <>
      <path d="M3 12h18l-2.2 7.2a1.6 1.6 0 0 1-1.5 1.1H6.7a1.6 1.6 0 0 1-1.5-1.1z" />
      <circle cx="8.5" cy="8.4" r="2" />
      <circle cx="13" cy="6.6" r="2.2" />
      <circle cx="16.6" cy="9" r="1.7" />
    </>
  ),
  tug: (
    <>
      <path d="M2 10.5h3.2l2.3 3 3-3.6 3 3.6 3-3.6 2.3 3H22v3h-4.6l-1-1.3-2.9 3.5-3-3.6-3 3.6-2.9-3.5-1 1.3H2z" />
    </>
  ),
  ball: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.5 6.5c3 2.6 3 8.4 0 11M18.5 6.5c-3 2.6-3 8.4 0 11" fill="none" stroke="rgba(0,0,0,.35)" strokeWidth="1.6" />
    </>
  ),
  star: <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z" />,
  moon: (
    <>
      <path d="M15.5 3.2a9 9 0 1 0 5.3 13.5A7.6 7.6 0 0 1 15.5 3.2z" />
      <path d="M16 7h4l-4 4.4h4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  heart: <path d="M12 21C4.5 15.4 2 11.6 2 8.2A5 5 0 0 1 12 6a5 5 0 0 1 10 2.2c0 3.4-2.5 7.2-10 12.8z" />,
  tv: (
    <>
      <rect x="2.5" y="7" width="19" height="13" rx="2.6" />
      <path d="M8 2.5l4 4.5 4-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <rect x="5.4" y="9.8" width="10.4" height="7.4" rx="1.2" fill="rgba(0,0,0,.3)" />
    </>
  ),
  run: <path d="M2 5h5.5l5 7-5 7H2l5-7zM10.5 5H16l5 7-5 7h-5.5l5-7z" />,
  bark: (
    <>
      <path d="M3 9.5h3.6L11 5.8v12.4l-4.4-3.7H3z" />
      <path d="M14 8.6a5 5 0 0 1 0 6.8M16.8 5.8a9 9 0 0 1 0 12.4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  tail: <path d="M12 12.2a1.6 1.6 0 1 1 1.6-1.6c0 2.6-2.2 4.4-4.6 4.4a5.6 5.6 0 0 1-5.6-5.6A8.4 8.4 0 0 1 11.8 1 10.6 10.6 0 0 1 22.4 11.6c0 5.8-4.4 10.6-10.6 11.2v-2.6c4.6-.6 8-4.2 8-8.6a8 8 0 0 0-8-8 5.8 5.8 0 0 0-5.8 5.8 3 3 0 0 0 3 3c1 0 2-.7 2-1.8z" />,
  laser: (
    <>
      <path d="M1.5 12S5.4 5.5 12 5.5 22.5 12 22.5 12 18.6 18.5 12 18.5 1.5 12 1.5 12z" />
      <circle cx="12" cy="12" r="3.6" fill="rgba(0,0,0,.4)" />
      <circle cx="12" cy="12" r="1.5" fill="#fff" />
    </>
  ),
  bone: <path d="M6.4 3.2a2.9 2.9 0 0 1 2.8 3.6l8 8a2.9 2.9 0 1 1 1.6 4.6 2.9 2.9 0 1 1-4.6-1.6l-8-8a2.9 2.9 0 1 1-1.6-4.6 2.9 2.9 0 0 1 1.8-2z" />,
  static: <path d="M13.5 1.5L4.5 13.5h6L8.5 22.5l11-13.4h-6.6z" />,
  zoomies: (
    <>
      <path d="M10 4h5.5l5.5 8-5.5 8H10l5.5-8z" />
      <path d="M2 7h7M1 12h8M3 17h6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </>
  ),
  jaw: <path d="M3 4h18l-2.4 6.5-2.6-3-2 8.5-2-6-2 6-2-8.5-2.6 3z M6 19h12v2.5H6z" />,
  bell: (
    <>
      <path d="M12 2.5a6.5 6.5 0 0 1 6.5 6.5v5l2 3.2H3.5l2-3.2V9A6.5 6.5 0 0 1 12 2.5z" />
      <circle cx="12" cy="20.2" r="2" />
    </>
  ),
  lungs: (
    <>
      <path d="M3 9.5h4L15 4v16l-8-5.5H3z" />
      <path d="M17.5 8.5l3.5-2M17.5 12H22M17.5 15.5l3.5 2" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </>
  ),
  paws: <path d="M20.5 2.5c-9 0-15 5.6-15 12.4v2L2.5 20l1.6 1.6 3.1-3.1h2c6.8 0 11.3-6 11.3-16zM8.5 15.5l7-7" />,
  magnet: <path d="M4 3h5.5v9a2.5 2.5 0 0 0 5 0V3H20v9a8 8 0 0 1-16 0zM4 3h5.5v3.4H4zM14.5 3H20v3.4h-5.5z" />,
  snack: (
    <>
      <path d="M5.6 4.2a2.4 2.4 0 0 1 2.3 3l6.9 6.9a2.4 2.4 0 1 1 1.3 3.8 2.4 2.4 0 1 1-3.8-1.3l-6.9-6.9a2.4 2.4 0 1 1-1.3-3.8 2.4 2.4 0 0 1 1.5-1.7z" />
      <path d="M17.6 3v6.4M14.4 6.2h6.4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  clover: (
    <>
      <circle cx="8" cy="8" r="4.2" />
      <circle cx="16" cy="8" r="4.2" />
      <circle cx="8" cy="16" r="4.2" />
      <circle cx="16" cy="16" r="4.2" />
    </>
  ),
  fur: <path d="M12 1.8l8.5 3.4v6.4c0 5.2-3.4 9-8.5 10.6-5.1-1.6-8.5-5.4-8.5-10.6V5.2z" />,
  skull: (
    <>
      <path d="M12 2.5a8.5 8.5 0 0 0-5 15.4V21h10v-3.1a8.5 8.5 0 0 0-5-15.4z" />
      <circle cx="8.8" cy="11" r="2.1" fill="rgba(0,0,0,.55)" />
      <circle cx="15.2" cy="11" r="2.1" fill="rgba(0,0,0,.55)" />
    </>
  ),
  home: <path d="M12 2.5l10 8.8h-2.8V21h-5.4v-6h-3.6v6H4.8v-9.7H2z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 6.5V12l4 2.6" fill="none" stroke="rgba(0,0,0,.55)" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  gear: <path d="M10.2 1.5h3.6l.5 2.6 1.9.8 2.2-1.5 2.5 2.5-1.5 2.2.8 1.9 2.6.5v3.6l-2.6.5-.8 1.9 1.5 2.2-2.5 2.5-2.2-1.5-1.9.8-.5 2.6h-3.6l-.5-2.6-1.9-.8-2.2 1.5-2.5-2.5 1.5-2.2-.8-1.9-2.6-.5v-3.6l2.6-.5.8-1.9-1.5-2.2 2.5-2.5 2.2 1.5 1.9-.8zM12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6z" fillRule="evenodd" />,
  target: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <circle cx="12" cy="12" r="5.6" fill="rgba(0,0,0,.35)" />
      <circle cx="12" cy="12" r="2.2" fill="#fff" />
    </>
  ),
  strength: <path d="M2 9h2.4V6.5H7V10h10V6.5h2.6V9H22v6h-2.4v2.5H17V14H7v3.5H4.4V15H2z" />,
  zz: <path d="M4 4h9l-6 7h6v2.5H4L10 6.5H4zM14 13h7l-4.4 5H21v2.5h-7l4.4-5H14z" />,
  dog: (
    <>
      <path d="M4 8l3-5 3 4h4l3-4 3 5-1.5 6.5c-.8 4-3.4 6.5-7.5 6.5s-6.7-2.5-7.5-6.5z" />
      <circle cx="9" cy="11.5" r="1.4" fill="rgba(0,0,0,.6)" />
      <circle cx="15" cy="11.5" r="1.4" fill="rgba(0,0,0,.6)" />
      <ellipse cx="12" cy="15.6" rx="1.8" ry="1.3" fill="rgba(0,0,0,.6)" />
    </>
  ),
};

const ALIAS: Record<string, string> = { walk: 'paw', fetch: 'ball', train: 'star', nap: 'moon', pet: 'heart', vitality: 'heart', agility: 'run', focus: 'target', bond: 'paw', fatigue: 'zz' };

export function Icon({ name, size = 22, style }: { name: string; size?: number; style?: CSSProperties }) {
  const body = ICONS[name] ?? ICONS[ALIAS[name] ?? 'star'];
  return (
    <svg className="icon" viewBox="0 0 24 24" width={size} height={size} fill="currentColor" style={style} aria-hidden="true">
      {body}
    </svg>
  );
}

export function Bar({ value, max, className, children }: { value: number; max: number; className?: string; children?: ReactNode }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1e-6, max)) * 100));
  return (
    <div className={`bar ${className ?? ''}`}>
      <div className="bar-fill" style={{ width: `${pct}%` }} />
      {children ? <div className="bar-label">{children}</div> : null}
    </div>
  );
}

/** 주인 얼굴 아이콘. 의심도 단계(0~4)에 따라 표정이 바뀐다. */
export function OwnerFace({ tier, size = 52 }: { tier: number; size?: number }) {
  const brows = [
    'M13 17q4-3 8-1M27 16q4-2 8 1',
    'M13 16q4-3 8 0M27 14q4-1 8 2',
    'M13 15l8 2.5M27 17.5l8-2.5',
    'M13 14l8 4M27 18l8-4',
    'M12 13l9 5M27 18l9-5',
  ][tier];
  const mouth = ['M17 31q7 6 14 0', 'M18 32q6 2 12-1', 'M18 33h12', 'M18 34q6-4 12 0', 'M19 31q5-3 10 0v5q-5 3-10 0z'][tier];
  const skin = ['#f6c9a0', '#f6c9a0', '#f3bf96', '#eeb08a', '#e99c7c'][tier];
  return (
    <svg className={`owner-face tier-${tier}`} viewBox="0 0 48 48" width={size} height={size} aria-label={`주인 표정 ${tier}단계`}>
      <circle cx="24" cy="26" r="17" fill={skin} stroke="#3b2a20" strokeWidth="2.4" />
      <path d="M7 24C6 10 16 4 24 4s19 5 17 20c-3-6-8-9-17-9S10 18 7 24z" fill="#231a1a" />
      <circle cx="24" cy="5.5" r="4.5" fill="#231a1a" />
      <ellipse cx="17.5" cy="23.5" rx="2.2" ry={tier >= 3 ? 1.5 : 2.8} fill="#231a1a" />
      <ellipse cx="30.5" cy="23.5" rx="2.2" ry={tier >= 3 ? 1.5 : 2.8} fill="#231a1a" />
      <path d={brows} fill="none" stroke="#231a1a" strokeWidth="2.2" strokeLinecap="round" />
      <path d={mouth} fill={tier === 4 ? '#7a2b2b' : 'none'} stroke="#3b2a20" strokeWidth="2.2" strokeLinecap="round" />
      {tier >= 2 ? <path d="M38 12l3 5a3 3 0 1 1-6 0z" fill="#8fd0ff" /> : null}
    </svg>
  );
}

export function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtHour(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${h < 12 ? '오전' : '오후'} ${h > 12 ? h - 12 : h}:${String(m).padStart(2, '0')}`;
}
