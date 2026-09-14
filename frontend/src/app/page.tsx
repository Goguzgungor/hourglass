import HourglassIcon from '@/components/HourglassIcon';
import Constellation from '@/components/Constellation';
import NetworkBadge from '@/components/NetworkBadge';

export default function Home() {
  return (
    <div className="relative">
      {/* ---------- Stanza 1 — Headline ---------- */}
      <section className="relative pt-12 sm:pt-20 lg:pt-0 lg:flex lg:items-center lg:min-h-[calc(100svh-7rem)]">
        {/* Constellation accent — pinned to top-right, very faint.
            Hidden on phones to avoid colliding with the headline. */}
        <div
          className="hidden sm:block pointer-events-none absolute top-0 right-2 sm:right-12 lg:right-24 xl:right-32 2xl:right-48 opacity-90"
          aria-hidden
        >
          <Constellation width={210} height={160} />
        </div>

        <div className="w-full mx-auto max-w-[1280px] xl:max-w-[1640px] 2xl:max-w-[1920px] px-4 sm:px-6 md:px-10 xl:px-16 2xl:px-24">
          <div className="grid grid-cols-12 gap-x-4 sm:gap-x-8 xl:gap-x-12 items-end lg:items-center">
            {/* Left column — copy */}
            <div className="col-span-12 lg:col-span-8 xl:col-span-7 2xl:col-span-7 reveal">
              <p className="eyebrow mb-6 sm:mb-8 xl:text-[0.78rem] 2xl:text-[0.85rem]">
                <span className="text-sand">·</span>{' '}
                <span className="ml-1">Hourglass</span>{' '}
                <span className="mx-2 text-stroke-2">/</span> A precision
                instrument for on-chain time
              </p>

              <h1 className="headline text-cream text-5xl sm:text-6xl md:text-7xl lg:text-8xl xl:text-[10rem] 2xl:text-[11.5rem]">
                Time, distilled
                <br />
                <span className="text-sand-bright">into payment.</span>
              </h1>

              <p className="mt-8 sm:mt-10 xl:mt-12 max-w-[540px] xl:max-w-[640px] 2xl:max-w-[720px] text-base sm:text-lg xl:text-xl 2xl:text-2xl leading-relaxed text-cream-muted">
                Stream SEP-41 tokens to a recipient on a precise schedule. Vest,
                pay, grant — by the second. No off-chain assumptions, no oracles
                in the hot path, no protocol fee on the streamed asset.
              </p>

              <div className="mt-10 sm:mt-12 xl:mt-14 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 sm:gap-4">
                <a
                  href="/create"
                  className="
                    group inline-flex items-center justify-center gap-3
                    bg-sand text-night
                    px-7 py-3.5 xl:px-9 xl:py-4 2xl:px-10 2xl:py-5 min-h-[44px]
                    text-[11px] xl:text-[12px] 2xl:text-[13px] uppercase tracking-[0.18em] font-medium
                    rounded-none border border-sand
                    hover:bg-sand-bright hover:border-sand-bright
                    transition-colors duration-200
                  "
                >
                  Create a stream
                  <span className="translate-y-[-1px] text-base leading-none transition-transform group-hover:translate-x-[2px]">
                    →
                  </span>
                </a>
                <a
                  href="/stream/1"
                  className="
                    group inline-flex items-center justify-center gap-3
                    text-sand
                    px-7 py-3.5 xl:px-9 xl:py-4 2xl:px-10 2xl:py-5 min-h-[44px]
                    text-[11px] xl:text-[12px] 2xl:text-[13px] uppercase tracking-[0.18em] font-medium
                    rounded-none border border-sand/60
                    hover:border-sand hover:text-sand-bright hover:bg-sand/5
                    transition-colors duration-200
                  "
                >
                  View a stream by ID
                </a>
              </div>

              {/* Tiny status strip under the CTAs — network-aware */}
              <NetworkBadge />
            </div>

            {/* Right column — hourglass instrument */}
            <div className="hidden lg:flex col-span-4 xl:col-span-5 2xl:col-span-5 justify-center pb-12 lg:pb-0 relative">
              <div className="reveal" style={{ animationDelay: '160ms' }}>
                <div className="w-[210px] xl:w-[300px] 2xl:w-[380px] mx-auto">
                  <HourglassIcon
                    fill={0.62}
                    animated
                    className="w-full h-auto"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Mobile hourglass (replaces right column) */}
          <div className="flex lg:hidden justify-center mt-12 sm:mt-16">
            <HourglassIcon size={120} fill={0.62} animated />
          </div>
        </div>
      </section>

      {/* ---------- Stanza 2 — Principles ---------- */}
      <section
        id="principles"
        className="relative mt-24 sm:mt-32 md:mt-40"
      >
        <div className="mx-auto max-w-[1280px] xl:max-w-[1640px] 2xl:max-w-[1920px] px-4 sm:px-6 md:px-10 xl:px-16 2xl:px-24">
          <hr className="hairline" />

          <div className="grid grid-cols-12 gap-x-4 sm:gap-x-8 xl:gap-x-12 pt-10 sm:pt-14 xl:pt-20">
            <div className="col-span-12 md:col-span-3">
              <p className="eyebrow">Principles</p>
              <p className="mt-4 headline-roman text-2xl sm:text-3xl xl:text-4xl 2xl:text-5xl text-cream">
                Three axioms,
                <br />
                no exceptions.
              </p>
            </div>

            <div className="col-span-12 md:col-span-9 mt-8 md:mt-0">
              <div className="grid md:grid-cols-3 md:divide-x md:divide-stroke">
                <Principle
                  index="01"
                  label="Precision"
                  body="Every second of a vesting schedule is verifiable on-chain. Cliffs, lump-sum unlocks, and linear streaming are computed deterministically — no off-chain assumptions, no oracles in the hot path."
                />
                <Principle
                  index="02"
                  label="Permissionless"
                  body="No protocol fee on the streamed asset. Streams are NFT receipts: transferable, cancellable until renounced, and withdrawable at any moment by the recipient."
                />
                <Principle
                  index="03"
                  label="Stellar-native"
                  body="Built on Soroban with SEP-41 tokens. XLM, USDC, EURC — the same interface and the same predictability. Cheap, fast, final."
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Stanza 3 — The Surface ---------- */}
      <section id="surface" className="relative mt-24 sm:mt-32 md:mt-40">
        <div className="mx-auto max-w-[1280px] xl:max-w-[1640px] 2xl:max-w-[1920px] px-4 sm:px-6 md:px-10 xl:px-16 2xl:px-24">
          <hr className="hairline" />

          <div className="grid grid-cols-12 gap-x-4 sm:gap-x-8 xl:gap-x-12 pt-10 sm:pt-14 xl:pt-20">
            <div className="col-span-12 md:col-span-4">
              <p className="eyebrow">Specification</p>
              <p className="mt-4 headline-roman text-2xl sm:text-3xl xl:text-4xl 2xl:text-5xl text-cream">
                Surface area,
                <br />
                in full.
              </p>
              <p className="mt-6 text-sm xl:text-base leading-relaxed text-cream-muted max-w-xs xl:max-w-sm">
                A primitive should be legible at a glance. The whole shape of
                the system fits on one card.
              </p>
            </div>

            <div className="col-span-12 md:col-span-8 mt-8 md:mt-0">
              <SpecRow
                k="Network"
                v="Stellar / Soroban"
                kicker="L1"
              />
              <SpecRow
                k="Token standard"
                v="SEP-41"
                kicker="fungible"
              />
              <SpecRow
                k="Stream shapes"
                v="Linear · Tranched · Recurring"
                kicker="2"
              />
              <SpecRow
                k="Receipt"
                v="NFT (ERC-721 equivalent)"
                kicker="transferable"
              />
              <SpecRow
                k="Fee on stream"
                v="0.00%"
                kicker="permissionless"
              />
              <SpecRow
                k="License"
                v="Apache-2.0"
                kicker="OSS"
                last
              />

              <p className="mt-16 max-w-xl xl:max-w-2xl headline-roman text-2xl xl:text-3xl 2xl:text-4xl text-cream italic leading-snug">
                An open-source primitive for predictable on-chain settlement.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ---------- Helper subcomponents ---------- */

function Principle({
  index,
  label,
  body,
}: {
  index: string;
  label: string;
  body: string;
}) {
  return (
    <div className="px-0 md:px-8 xl:px-10 first:pl-0 last:pr-0 pb-8 md:pb-0 border-b md:border-b-0 border-stroke/40 last:border-b-0 mb-8 md:mb-0 last:mb-0">
      <p className="font-mono text-sm xl:text-base text-sand mb-4 tabular">{index}</p>
      <p className="eyebrow mb-3 text-cream xl:text-[0.78rem] 2xl:text-[0.85rem]">{label}</p>
      <p className="text-[15px] xl:text-base 2xl:text-lg leading-relaxed text-cream-muted max-w-[34ch] xl:max-w-[38ch]">
        {body}
      </p>
    </div>
  );
}

function SpecRow({
  k,
  v,
  kicker,
  last = false,
}: {
  k: string;
  v: string;
  kicker?: string;
  last?: boolean;
}) {
  return (
    <div
      className={
        'grid grid-cols-12 items-baseline gap-x-3 py-5 ' +
        (last ? '' : 'border-b border-stroke/40')
      }
    >
      <div className="col-span-12 sm:col-span-4">
        <p className="eyebrow text-cream-dim xl:text-[0.78rem] 2xl:text-[0.85rem]">{k}</p>
      </div>
      <div className="col-span-8 sm:col-span-6 mt-1 sm:mt-0 font-mono text-sm sm:text-base xl:text-lg 2xl:text-xl text-cream break-words">
        {v}
      </div>
      <div className="col-span-4 sm:col-span-2 mt-1 sm:mt-0 text-right min-w-0">
        {kicker && (
          <span className="font-mono text-[10px] xl:text-[11px] 2xl:text-[12px] uppercase tracking-[0.16em] text-cream-dim/70 break-words">
            {kicker}
          </span>
        )}
      </div>
    </div>
  );
}
