import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function LibraryMark({ className, ...props }: ComponentProps<'svg'>) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      className={cn('size-11 shrink-0', className)}
      {...props}
    >
      <rect x="1" y="1" width="46" height="46" rx="12" stroke="currentColor" strokeOpacity=".35" />
      <path
        d="M10 15c5-1 9 0 14 3 5-3 9-4 14-3v20c-5-1-9 0-14 3-5-3-9-4-14-3V15Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M24 18v20M14 20l6 2m-6 3 6 2m8-5 6-2m-6 7 6-2M16 10h16"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

// A local SVG keeps the illustration crisp, lightweight and available offline.
export function LibraryIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 440 330" fill="none" aria-hidden="true" className={className}>
      <path d="M71 275V131a149 149 0 0 1 298 0v144" stroke="#a48b68" strokeOpacity=".35" />
      <path d="M90 275V132a130 130 0 0 1 260 0v143" stroke="#a48b68" strokeOpacity=".2" />
      <path d="M220 22v56m-96-16 37 40m155-40-37 40" stroke="#a48b68" strokeOpacity=".2" />
      <path d="M55 283h330M66 292h308" stroke="#c5ab82" strokeWidth="2" />
      <path d="M105 275V145h230v130M99 208h242M99 151h242" stroke="#b69b75" strokeWidth="2" />
      <g stroke="#e6d1ad" strokeOpacity=".6">
        <rect x="115" y="162" width="18" height="43" rx="2" fill="#8d7052" />
        <rect x="137" y="157" width="24" height="48" rx="2" fill="#53604c" />
        <rect x="165" y="166" width="15" height="39" rx="2" fill="#aa8960" />
        <path d="m187 162 14-4 13 44-15 4-12-44Z" fill="#8e6048" />
        <rect x="239" y="162" width="17" height="43" rx="2" fill="#aa8960" />
        <rect x="260" y="155" width="25" height="50" rx="2" fill="#786653" />
        <rect x="289" y="163" width="14" height="42" rx="2" fill="#53604c" />
        <rect x="307" y="159" width="17" height="46" rx="2" fill="#8e6048" />
        <rect x="116" y="220" width="23" height="53" rx="2" fill="#53604c" />
        <rect x="143" y="228" width="16" height="45" rx="2" fill="#aa8960" />
        <rect x="163" y="224" width="22" height="49" rx="2" fill="#8e6048" />
        <rect x="190" y="218" width="18" height="55" rx="2" fill="#786653" />
        <path d="m222 229 16-5 15 45-17 5-14-45Z" fill="#aa8960" />
        <rect x="266" y="252" width="58" height="9" rx="2" fill="#53604c" />
        <rect x="260" y="264" width="64" height="9" rx="2" fill="#8e6048" />
        <rect x="269" y="240" width="50" height="9" rx="2" fill="#aa8960" />
      </g>
      <path
        d="M121 170h6m-6 25h6m16-29h12m-12 28h12m-6-22v15m96-17h6m-6 25h6m14-32h13m-13 31h13m19-23h5m-5 23h5m13-26h7m-7 26h7M122 230h11m-11 31h11m15-25h6m-6 25h6m14-29h10m-10 29h10m17-35h6m-6 36h6"
        stroke="#ead8b7"
        strokeOpacity=".7"
      />
      <path
        d="M192 119c10-4 19-3 28 3 9-6 18-7 28-3v20c-10-3-19-2-28 4-9-6-18-7-28-4v-20Z"
        stroke="#d2ba92"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M220 123v19M201 126l10 2m18 0 10-2M179 128h-19m120 0h-19"
        stroke="#d2ba92"
        strokeLinecap="round"
      />
      <circle cx="220" cy="93" r="2" fill="#d2ba92" />
    </svg>
  );
}
