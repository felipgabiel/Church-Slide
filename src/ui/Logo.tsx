/** Marca: um slide com três linhas de letra centralizadas. */
export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect x="3" y="6.5" width="26" height="19" rx="4.5" stroke="var(--accent)" strokeWidth="1.9" />
      <path d="M10.5 13h11M8 16.5h16M12.5 20h7" stroke="var(--accent-hi)" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark">
      <LogoMark />
      <span>Church Slide</span>
    </span>
  );
}
