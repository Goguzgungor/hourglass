import Link from 'next/link';
import HourglassIcon from './HourglassIcon';

export default function Wordmark() {
  return (
    <Link
      href="/"
      className="group flex items-baseline gap-3 outline-none"
      aria-label="Hourglass home"
    >
      <span className="translate-y-[3px]">
        <HourglassIcon size={20} fill={0.6} animated />
      </span>
      <span
        className="headline-roman text-2xl xl:text-[1.75rem] 2xl:text-[2rem] text-cream group-hover:text-sand-bright transition-colors"
        style={{ fontStyle: 'italic' }}
      >
        Hourglass
      </span>
    </Link>
  );
}
