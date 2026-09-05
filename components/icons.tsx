/**
 * Hand-inlined Lucide-style icons.
 *
 * Inlined rather than added as a dependency: the set is small, and every
 * icon here is decorative next to a text label, so they are all
 * aria-hidden. Never use an emoji as an icon — it renders differently on
 * every OS and screen readers announce it as prose.
 */
import type { SVGProps } from "react";
import type { IndustryAgentId } from "@/lib/shared/types";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "width" | "height"> {
  size?: number;
}

function Svg({ size = 16, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Svg>
);

export const XIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
);

export const BanIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m5.6 5.6 12.8 12.8" />
  </Svg>
);

export const DotIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3.5" fill="currentColor" />
  </Svg>
);

export const BoltIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5Z" />
  </Svg>
);

export const CoinsIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="9" r="6" />
    <path d="M18.1 6.2a6 6 0 0 1 0 11.6M15.5 4.3a8.5 8.5 0 0 1 0 15.4" />
  </Svg>
);

export const LinkIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 11a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.4-1.4" />
    <path d="M10 13a4.5 4.5 0 0 0 6.4 0l3-3A4.5 4.5 0 0 0 13 3.6L11.6 5" />
  </Svg>
);

export const CopyIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </Svg>
);

export const ChevronIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9 18 6-6-6-6" />
  </Svg>
);

export const SpinnerIcon = ({ size = 16, ...rest }: IconProps) => (
  <Svg size={size} className="spinner" {...rest}>
    <path d="M21 12a9 9 0 1 1-6.2-8.6" />
  </Svg>
);

export const SunIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Svg>
);

export const MoonIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
  </Svg>
);

export const MonitorIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </Svg>
);

export const AlertIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3 2 20h20L12 3Z" />
    <path d="M12 9v5M12 17.5v.01" />
  </Svg>
);

export const InfoIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8v.01" />
  </Svg>
);

/* --- industry agents --- */

export const ScaleIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3v18M7 21h10M3 8h18M6 8l-3 6h6L6 8ZM18 8l-3 6h6l-3-6Z" />
  </Svg>
);

export const HeartPulseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20.4 5.6a5 5 0 0 0-7.1 0L12 6.9l-1.3-1.3a5 5 0 0 0-7.1 7.1l7.1 7.1a1.7 1.7 0 0 0 2.4 0l7.3-7.1a5 5 0 0 0 0-7.1Z" />
    <path d="M3.5 12.5h4l1.5-3 2 5 1.5-2.5h4" />
  </Svg>
);

export const TrendingUpIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m3 17 6-6 4 4 8-8" />
    <path d="M15 7h6v6" />
  </Svg>
);

export const CpuIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="5" width="14" height="14" rx="2" />
    <rect x="9" y="9" width="6" height="6" rx="1" />
    <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
  </Svg>
);

export const LayersIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12 2 9 5-9 5-9-5 9-5Z" />
    <path d="m3 12 9 5 9-5M3 17l9 5 9-5" />
  </Svg>
);

// Exhaustive over IndustryAgentId on purpose: adding an agent should fail the
// typecheck here rather than silently fall back to a generic dot.
const INDUSTRY_ICONS: Record<IndustryAgentId, (p: IconProps) => React.JSX.Element> = {
  legal: ScaleIcon,
  healthcare: HeartPulseIcon,
  finance: TrendingUpIcon,
  technology: CpuIcon,
  general: LayersIcon,
};

export function IndustryIcon({ industryId, ...rest }: IconProps & { industryId: IndustryAgentId }) {
  const Icon = INDUSTRY_ICONS[industryId] ?? DotIcon;
  return <Icon {...rest} />;
}
