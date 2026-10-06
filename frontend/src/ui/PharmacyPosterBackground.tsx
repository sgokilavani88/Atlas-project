import React from 'react';

interface Props {
  showLineArt?: boolean;
  children?: React.ReactNode;
}

/**
 * Pure CSS blurred pharmacy-shelf background fading from pale mint (#E6F0EC) at top
 * to soft aqua (#BFE4E2) at bottom, with blurred medicine bottle silhouettes, shelves,
 * frosted-glass overlay, and translucent steel-blue inline SVG medical line art in bottom-right.
 */
export const PharmacyPosterBackground: React.FC<Props> = ({
  showLineArt = true,
  children,
}) => {
  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-gradient-to-b from-[#E6F0EC] via-[#D5EAE6] to-[#BFE4E2] text-[#2C4675] selection:bg-[#3F68A8] selection:text-white">
      {/* Pure CSS Blurred Pharmacy Shelf & Medicine Bottles Scene */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >
        {/* Upper pharmacy shelf blur line */}
        <div className="absolute top-[22%] left-[-5%] right-[-5%] h-6 bg-white/40 blur-xl" />

        {/* Left Amber Apothecary Bottle Silhouette */}
        <div className="absolute top-[46%] left-[12%] h-56 w-36 rounded-3xl bg-[#8C6D58]/35 blur-2xl" />
        <div className="absolute top-[42%] left-[15%] h-10 w-20 rounded-t-xl bg-[#D8E2DC]/70 blur-xl" />
        <div className="absolute top-[53%] left-[13%] h-28 w-32 rounded-xl bg-white/65 blur-xl" />

        {/* Second Warm Amber Bottle with White Label & Red Band */}
        <div className="absolute top-[44%] left-[24%] h-60 w-40 rounded-3xl bg-[#7F5539]/30 blur-2xl" />
        <div className="absolute top-[52%] left-[25%] h-32 w-36 rounded-2xl bg-[#F8FAFC]/80 blur-xl" />
        <div className="absolute top-[55%] left-[26%] h-4 w-32 bg-[#BC6C4F]/35 blur-lg" />

        {/* Center Tall White Pharmacy Canister with Teal Cap (just like the poster!) */}
        <div className="absolute top-[23%] left-[44%] h-12 w-24 -translate-x-1/2 rounded-t-2xl bg-[#4FD1C5]/55 blur-xl" />
        <div className="absolute top-[30%] left-[45%] h-80 w-52 -translate-x-1/2 rounded-[2.5rem] bg-white/75 blur-2xl" />
        <div className="absolute top-[42%] left-[45%] h-6 w-44 -translate-x-1/2 bg-[#90CDF4]/45 blur-lg" />

        {/* Right Dark Apothecary Bottle with White Label & Seal */}
        <div className="absolute top-[39%] left-[63%] h-64 w-44 rounded-3xl bg-[#2D3748]/35 blur-2xl" />
        <div className="absolute top-[49%] left-[64%] h-36 w-40 rounded-2xl bg-white/75 blur-xl" />
        <div className="absolute top-[56%] left-[70%] h-12 w-12 rounded-full bg-[#4263A0]/30 blur-lg" />

        {/* Far Right Frosted Glass Bottle */}
        <div className="absolute top-[28%] right-[6%] h-80 w-44 rounded-3xl bg-white/60 blur-2xl" />
        <div className="absolute top-[48%] right-[7%] h-36 w-40 rounded-2xl bg-[#E2E8F0]/70 blur-xl" />

        {/* Lower Pharmacy Counter Surface */}
        <div className="absolute bottom-0 left-0 right-0 h-[26%] bg-gradient-to-t from-[#B5E0DE]/90 via-[#C7E8E6]/75 to-transparent blur-xl" />

        {/* Frosted-Glass Overlay */}
        <div className="absolute inset-0 bg-white/25 backdrop-blur-[6px]" />
      </div>

      {/* Bottom-Right Translucent Blue Line-Art Icons (matching poster layout) */}
      {showLineArt && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed right-0 bottom-0 z-0 h-[420px] w-[520px] opacity-40 select-none"
        >
          <svg
            viewBox="0 0 520 420"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="h-full w-full text-[#4263A0]"
          >
            {/* Stethoscope curving in from top-right */}
            <path
              d="M445 88 C410 72, 378 120, 405 182 C432 244, 480 265, 505 235 C530 205, 535 140, 505 100"
              stroke="currentColor"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <rect
              x="442"
              y="76"
              width="20"
              height="14"
              rx="6"
              transform="rotate(-25 442 76)"
              stroke="currentColor"
              strokeWidth="4"
              fill="#D5EAE6"
            />
            <rect
              x="485"
              y="92"
              width="20"
              height="14"
              rx="6"
              transform="rotate(30 485 92)"
              stroke="currentColor"
              strokeWidth="4"
              fill="#D5EAE6"
            />
            <path
              d="M465 252 L485 315 C495 345, 515 365, 510 395 C506 415, 480 412, 476 385"
              stroke="currentColor"
              strokeWidth="5"
              strokeLinecap="round"
            />
            {/* Stethoscope Chestpiece */}
            <circle
              cx="470"
              cy="372"
              r="18"
              stroke="currentColor"
              strokeWidth="5"
              fill="#D5EAE6"
            />
            <circle cx="470" cy="372" r="8" stroke="currentColor" strokeWidth="3.5" />

            {/* Tilted Medical Clipboard with Cross and Lines */}
            <g transform="translate(335, 228) rotate(18)">
              <rect
                x="0"
                y="14"
                width="112"
                height="152"
                rx="10"
                fill="currentColor"
                fillOpacity="0.35"
                stroke="currentColor"
                strokeWidth="4"
              />
              <rect
                x="12"
                y="28"
                width="88"
                height="124"
                rx="4"
                fill="#D5EAE6"
                fillOpacity="0.85"
              />
              {/* Clipboard top clip */}
              <path
                d="M32 8 H80 V26 H32 Z"
                rx="4"
                fill="#D5EAE6"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                d="M46 0 H66 V10 H46 Z"
                fill="#D5EAE6"
                stroke="currentColor"
                strokeWidth="3.5"
              />
              {/* Square with Medical Cross inside clipboard */}
              <rect
                x="22"
                y="42"
                width="42"
                height="40"
                rx="4"
                fill="currentColor"
                fillOpacity="0.45"
              />
              <path
                d="M43 50 V74 M31 62 H55"
                stroke="#D5EAE6"
                strokeWidth="6"
                strokeLinecap="round"
              />
              {/* Lines next to cross */}
              <line
                x1="72"
                y1="48"
                x2="90"
                y2="48"
                stroke="currentColor"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              <line
                x1="72"
                y1="62"
                x2="90"
                y2="62"
                stroke="currentColor"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              <line
                x1="72"
                y1="76"
                x2="90"
                y2="76"
                stroke="currentColor"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              {/* Full width lines below */}
              <line
                x1="22"
                y1="96"
                x2="90"
                y2="96"
                stroke="currentColor"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              <line
                x1="22"
                y1="112"
                x2="90"
                y2="112"
                stroke="currentColor"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              <line
                x1="22"
                y1="128"
                x2="90"
                y2="128"
                stroke="currentColor"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              <line
                x1="22"
                y1="142"
                x2="75"
                y2="142"
                stroke="currentColor"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
            </g>

            {/* Open Pill Bottle with Cross + Loose Pills & Capsules */}
            <g transform="translate(220, 295) rotate(8)">
              {/* Tilted Bottle Cap */}
              <rect
                x="4"
                y="-22"
                width="46"
                height="14"
                rx="4"
                transform="rotate(-24 4 -22)"
                fill="currentColor"
                fillOpacity="0.55"
              />
              {/* Bottle Body */}
              <rect
                x="2"
                y="8"
                width="54"
                height="78"
                rx="10"
                fill="currentColor"
                fillOpacity="0.3"
                stroke="currentColor"
                strokeWidth="3.5"
              />
              <rect
                x="8"
                y="24"
                width="42"
                height="46"
                rx="5"
                fill="#D5EAE6"
                fillOpacity="0.8"
              />
              {/* Medical Cross on Bottle */}
              <path
                d="M29 35 V59 M17 47 H41"
                stroke="currentColor"
                strokeWidth="7"
                strokeLinecap="round"
              />
            </g>

            {/* Loose Pills & Capsules */}
            <circle cx="290" cy="298" r="6" fill="currentColor" fillOpacity="0.5" />
            <line x1="286" y1="294" x2="294" y2="302" stroke="#D5EAE6" strokeWidth="2" />
            <circle cx="305" cy="308" r="6" fill="currentColor" fillOpacity="0.5" />
            <line x1="301" y1="304" x2="309" y2="312" stroke="#D5EAE6" strokeWidth="2" />
            <rect
              x="294"
              y="324"
              width="24"
              height="10"
              rx="5"
              transform="rotate(28 294 324)"
              fill="currentColor"
              fillOpacity="0.55"
              stroke="currentColor"
              strokeWidth="2"
            />
            {/* Syringe */}
            <g transform="translate(245, 378) rotate(-22)">
              <rect
                x="0"
                y="0"
                width="62"
                height="20"
                rx="3"
                fill="currentColor"
                fillOpacity="0.45"
                stroke="currentColor"
                strokeWidth="3"
              />
              <line x1="62" y1="10" x2="84" y2="10" stroke="currentColor" strokeWidth="4" />
              <line x1="84" y1="2" x2="84" y2="18" stroke="currentColor" strokeWidth="4" />
            </g>
          </svg>
        </div>
      )}

      {/* Content Layer */}
      <div className="relative z-10">{children}</div>
    </div>
  );
};
