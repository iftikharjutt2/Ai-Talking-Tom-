import React from 'react';
import { TOM_PERSONAS, type TomPersonaId } from '../game/tomState';

export interface TitleScreenOverlayProps {
  selectedPersona: TomPersonaId;
  onSelectPersona: (id: TomPersonaId) => void;
  onStartGame: () => void;
}

export const TitleScreenOverlay: React.FC<TitleScreenOverlayProps> = ({
  selectedPersona,
  onSelectPersona,
  onStartGame,
}) => {
  const personas = Object.values(TOM_PERSONAS);

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-6 md:p-12">
      {/* Asymmetric Left-Third Composition leaving Tom unobstructed on the right stage */}
      <div className="my-auto max-w-lg pointer-events-auto bg-[#1D1526]/95 border-2 border-[#6B4226] rounded-3xl p-6 md:p-8 shadow-2xl">
        {/* Custom Inline SVG Title Emblem */}
        <div className="mb-5">
          <svg
            viewBox="0 0 420 115"
            className="w-full h-auto overflow-visible"
            role="img"
            aria-label="Talking Tom Studio Companion"
          >
            <defs>
              <filter id="titleShadow" x="-10%" y="-10%" width="120%" height="130%">
                <feDropShadow dx="0" dy="4" stdDeviation="0" floodColor="#451A03" />
              </filter>
            </defs>
            {/* Diegetic Wooden Stage Plaque Backing */}
            <rect
              x="4"
              y="6"
              width="412"
              height="102"
              rx="22"
              fill="#3E2214"
              stroke="#D97706"
              strokeWidth="4"
            />
            <rect
              x="12"
              y="14"
              width="396"
              height="86"
              rx="16"
              fill="#2B160C"
              stroke="#78350F"
              strokeWidth="2"
            />
            {/* Cat Ear Silhouette Accents */}
            <path
              d="M 34 14 L 48 -6 L 66 14 Z"
              fill="#F59E0B"
              stroke="#451A03"
              strokeWidth="3"
            />
            <path
              d="M 354 14 L 372 -6 L 386 14 Z"
              fill="#F59E0B"
              stroke="#451A03"
              strokeWidth="3"
            />
            {/* Main Display Lettering */}
            <text
              x="210"
              y="56"
              textAnchor="middle"
              fill="#FDE68A"
              stroke="#451A03"
              strokeWidth="6"
              style={{
                fontFamily: "'Fredoka', sans-serif",
                fontWeight: 700,
                fontSize: '38px',
                paintOrder: 'stroke fill',
                letterSpacing: '0.02em',
              }}
              filter="url(#titleShadow)"
            >
              TALKING TOM
            </text>
            <text
              x="210"
              y="84"
              textAnchor="middle"
              fill="#FCA5A5"
              style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontWeight: 700,
                fontSize: '14px',
                letterSpacing: '0.18em',
              }}
            >
              GEMINI VOICE &amp; LIP-SYNC STUDIO
            </text>
          </svg>
        </div>

        <p className="text-sm md:text-base text-[#E2D9F3] leading-relaxed mb-5">
          Chat with Tom about anything—science, stories, jokes, or daily life. Powered by Gemini with real-time phoneme lip-syncing and interactive care reactions.
        </p>

        {/* Persona Selection Grid */}
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-300/90 mb-2.5">
            Choose Tom&apos;s Companion Persona
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            {personas.map((p) => {
              const active = p.id === selectedPersona;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onSelectPersona(p.id)}
                  className={`text-left px-3.5 py-2.5 rounded-xl border transition-transform active:scale-95 ${
                    active
                      ? 'bg-[#422817] border-amber-400 text-amber-100 shadow-md'
                      : 'bg-[#281E32] border-[#4A3B5C] text-[#CBC2DC] hover:border-amber-500/60'
                  }`}
                >
                  <div className="text-xs font-bold whitespace-nowrap truncate">
                    {p.name}
                  </div>
                  <div className="text-[11px] text-amber-300/80 whitespace-nowrap truncate mt-0.5">
                    {p.kicker}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Primary Start Handshake CTA */}
        <button
          type="button"
          data-start="true"
          onClick={(e) => {
            e.currentTarget.blur();
            onStartGame();
          }}
          className="w-full py-3.5 px-6 rounded-2xl bg-amber-500 hover:bg-amber-400 active:scale-[0.99] text-slate-950 font-bold text-base tracking-wide shadow-lg transition-transform cursor-pointer whitespace-nowrap"
          style={{ fontFamily: "'Fredoka', sans-serif" }}
        >
          Wake Up Tom &amp; Start Chatting
        </button>
      </div>

      {/* Single flat borderless inline control hint at bottom safe margin */}
      <div className="w-full text-center text-xs md:text-sm text-[#D8CEE8] tracking-wide">
        Click Head/Belly/Paws to Pet · Type or Speak to Converse · Space Quick Joke · G Mouse Chase · Esc Pause
      </div>
    </div>
  );
};
