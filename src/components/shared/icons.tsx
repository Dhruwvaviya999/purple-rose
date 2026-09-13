import type { SVGProps } from "react";

/**
 * The small set of line icons the shell needs, inlined to avoid pulling in an
 * icon package for eight glyphs. Each icon inherits `currentColor` and stroke
 * width so it sits correctly inside buttons and links.
 *
 * Icons are decorative: the interactive element that wraps them carries the
 * accessible name.
 */
type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </Icon>
  );
}

export function HeartIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 20s-7.5-4.6-7.5-9.4A4.1 4.1 0 0 1 12 8a4.1 4.1 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z" />
    </Icon>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </Icon>
  );
}

export function BagIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5.5 8h13l-1 11.5a1.5 1.5 0 0 1-1.5 1.4H8a1.5 1.5 0 0 1-1.5-1.4Z" />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
    </Icon>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12h13" />
      <path d="m13 6 6 6-6 6" />
    </Icon>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v4.5" />
      <path d="M12 15.75h.01" />
    </Icon>
  );
}

export function FilterIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M7 12h10M10 17h4" />
    </Icon>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m9.5 6 6 6-6 6" />
    </Icon>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 9.5 6 6 6-6" />
    </Icon>
  );
}

export function TruckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 7.5h10.5v8H3z" />
      <path d="M13.5 10.5H17l3 3v2h-6.5z" />
      <circle cx="7" cy="17" r="1.6" />
      <circle cx="16.5" cy="17" r="1.6" />
    </Icon>
  );
}

export function ReturnIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 9h11a4.5 4.5 0 0 1 0 9h-5" />
      <path d="m7.5 5.5-3.5 3.5 3.5 3.5" />
    </Icon>
  );
}

export function StarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m12 4.5 2.35 4.76 5.25.76-3.8 3.7.9 5.23L12 16.48l-4.7 2.47.9-5.23-3.8-3.7 5.25-.76Z" />
    </Icon>
  );
}

export function CompassIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m14.8 9.2-1.6 4-4 1.6 1.6-4Z" />
    </Icon>
  );
}
