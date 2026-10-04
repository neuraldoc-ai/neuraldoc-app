import { useId } from "react";

function Box({
  x,
  y,
  width = 140,
  label,
  detail,
  className = "",
}: {
  x: number;
  y: number;
  width?: number;
  label: string;
  detail?: string;
  className?: string;
}) {
  return (
    <g className={className}>
      <rect
        x={x}
        y={y}
        width={width}
        height={detail ? 62 : 42}
        rx="10"
        className="visual-box"
      />
      <text x={x + 14} y={y + 25} className="visual-label">
        {label}
      </text>
      {detail && (
        <text x={x + 14} y={y + 45} className="visual-detail">
          {detail}
        </text>
      )}
    </g>
  );
}

export function WorkflowVisual({ step }: { step: number }) {
  const clipId = useId();
  const titles = [
    "Quellen fließen in einen gemeinsamen Kontext.",
    "Aus Code entsteht ein Graph aus Funktionen und Aufrufen.",
    "Jev bewertet Kandidaten und markiert die passende Komponente.",
    "Aus Belegen entsteht Zeile für Zeile ein Dokumentationsentwurf.",
    "Quellen werden geprüft, dann wird der Entwurf freigegeben.",
    "Eine Verbindung führt zurück zu ihrer konkreten Quelle.",
  ];
  return (
    <div className="architecture-demo rounded-xl border bg-muted/20 p-3 sm:p-5">
      <svg
        viewBox="0 0 560 240"
        className="w-full"
        role="img"
        aria-label={titles[step]}
      >
        <title>{titles[step]}</title>
        {step === 0 && (
          <>
            <path
              d="M170 48 C260 48 245 120 330 120 M170 120 H330 M170 192 C260 192 245 120 330 120"
              className="visual-wire"
            />
            <g className="source-code">
              <Box x={20} y={27} label="Code" width={150} />
            </g>
            <g className="source-ticket">
              <Box x={20} y={99} label="Ticket" width={150} />
            </g>
            <g className="source-doc">
              <Box x={20} y={171} label="Dokumentation" width={150} />
            </g>
            <circle r="3" className="source-particle source-particle-one" />
            <circle r="3" className="source-particle source-particle-two" />
            <circle r="3" className="source-particle source-particle-three" />
            <Box
              x={330}
              y={89}
              width={210}
              label="Gemeinsamer Kontext"
              detail="Was ändert sich – und warum?"
              className="source-context"
            />
          </>
        )}
        {step === 1 && (
          <>
            <rect
              x="20"
              y="53"
              width="180"
              height="130"
              rx="12"
              className="visual-box"
            />
            <text x="38" y="80" className="visual-detail">
              Code · schematisch
            </text>
            <g className="graph-code">
              <text x="38" y="110" className="visual-code">
                druckeBeleg()
              </text>
              <text x="48" y="139" className="visual-code">
                ↳ ladeVorlage()
              </text>
              <text x="48" y="164" className="visual-code">
                ↳ leseDaten()
              </text>
            </g>
            <path d="M210 120 H255" className="visual-wire graph-parse" />
            <text x="219" y="105" className="visual-detail">
              AST
            </text>
            <path
              d="M340 75 L430 156 M340 75 L290 156"
              className="visual-wire graph-edges"
            />
            <g className="graph-root">
              <circle cx="340" cy="75" r="24" className="visual-box" />
              <text x="340" y="79" textAnchor="middle" className="visual-label">
                f
              </text>
              <text
                x="340"
                y="37"
                textAnchor="middle"
                className="visual-detail"
              >
                druckeBeleg
              </text>
            </g>
            <g className="graph-child graph-child-one">
              <circle cx="290" cy="156" r="21" className="visual-box" />
              <text
                x="290"
                y="160"
                textAnchor="middle"
                className="visual-label"
              >
                f
              </text>
              <text
                x="290"
                y="199"
                textAnchor="middle"
                className="visual-detail"
              >
                ladeVorlage
              </text>
            </g>
            <g className="graph-child graph-child-two">
              <circle cx="430" cy="156" r="21" className="visual-box" />
              <text
                x="430"
                y="160"
                textAnchor="middle"
                className="visual-label"
              >
                f
              </text>
              <text
                x="430"
                y="199"
                textAnchor="middle"
                className="visual-detail"
              >
                leseDaten
              </text>
            </g>
          </>
        )}
        {step === 2 && (
          <>
            <Box
              x={20}
              y={85}
              width={150}
              label="Druckfunktion"
              detail="Änderung + Kontext"
            />
            <path
              d="M170 116 H220 M280 116 L350 43 M280 116 H350 M280 116 L350 189"
              className="visual-wire jev-candidates"
            />
            <rect
              x="220"
              y="86"
              width="60"
              height="60"
              rx="15"
              className="visual-box"
            />
            <text x="250" y="122" textAnchor="middle" className="visual-label">
              Jev
            </text>
            <rect
              x="228"
              y="94"
              width="44"
              height="3"
              rx="1.5"
              className="jev-scan"
            />
            <Box
              x={350}
              y={22}
              width={190}
              label="Fahrzeuge"
              className="jev-other"
            />
            <Box
              x={350}
              y={95}
              width={190}
              label="Belege & Druck"
              className="jev-match"
            />
            <Box
              x={350}
              y={168}
              width={190}
              label="Buchhaltung"
              className="jev-other"
            />
            <path d="M280 116 H350" className="visual-wire jev-connection" />
            <path d="M509 114 l5 5 9-10" className="visual-tick jev-check" />
            <text x="350" y="232" className="visual-detail">
              Passende Komponente · Modellvorschlag
            </text>
          </>
        )}
        {step === 3 && (
          <>
            <Box x={20} y={44} width={135} label="Code-Beleg" />
            <Box x={20} y={105} width={135} label="Bisherige Doku" />
            <path
              d="M155 65 L210 104 M155 126 L210 104 M265 104 H310"
              className="visual-wire"
            />
            <circle cx="238" cy="104" r="27" className="visual-box" />
            <text x="238" y="109" textAnchor="middle" className="visual-label">
              LLM
            </text>
            <rect
              x="310"
              y="22"
              width="230"
              height="193"
              rx="12"
              className="visual-box"
            />
            <text x="328" y="51" className="visual-detail">
              Dokumentationsentwurf
            </text>
            <defs>
              {[70, 100, 122, 144].map((y, i) => (
                <clipPath key={y} id={`${clipId}-${i}`}>
                  <rect
                    x="328"
                    y={y}
                    width="194"
                    height="24"
                    className={`llm-line llm-line-${["one", "two", "three", "four"][i]}`}
                  />
                </clipPath>
              ))}
            </defs>
            <text
              clipPath={`url(#${clipId}-0)`}
              x="328"
              y="88"
              className="visual-label"
            >
              Druckausgabe
            </text>
            <text
              clipPath={`url(#${clipId}-1)`}
              x="328"
              y="116"
              className="visual-detail"
            >
              Die Ausgabe nutzt die neue
            </text>
            <text
              clipPath={`url(#${clipId}-2)`}
              x="328"
              y="138"
              className="visual-detail"
            >
              Vorlagen-Schicht.
            </text>
            <text
              clipPath={`url(#${clipId}-3)`}
              x="328"
              y="160"
              className="visual-detail"
            >
              Beleg: geänderte Druckfunktion
            </text>
            <path d="M328 183 H510" className="visual-wire" />
            <text x="328" y="200" className="visual-detail">
              Vorschlag · noch ungeprüft
            </text>
          </>
        )}
        {step === 4 && (
          <>
            <rect
              x="80"
              y="23"
              width="400"
              height="190"
              rx="12"
              className="visual-box"
            />
            <text x="102" y="53" className="visual-label">
              Entwurf prüfen
            </text>
            {[
              "Quellen passen zum Text",
              "Änderung ist fachlich korrekt",
              "Formulierung ist verständlich",
            ].map((label, i) => (
              <g key={label}>
                <rect
                  x="103"
                  y={73 + i * 34}
                  width="17"
                  height="17"
                  rx="4"
                  className="visual-box"
                />
                <text x="134" y={86 + i * 34} className="visual-detail">
                  {label}
                </text>
                <path
                  d={`M107 ${81 + i * 34} l4 4 6-8`}
                  className={`visual-tick review-tick review-tick-${i}`}
                />
              </g>
            ))}
            <g className="review-approved">
              <rect
                x="344"
                y="174"
                width="116"
                height="25"
                rx="12"
                className="visual-box"
              />
              <text
                x="402"
                y="191"
                textAnchor="middle"
                className="visual-label"
              >
                Freigegeben
              </text>
            </g>
          </>
        )}
        {step === 5 && (
          <>
            <Box x={20} y={40} width={145} label="Druckfunktion" />
            <Box x={20} y={155} width={145} label="Vorlage" />
            <path d="M92 82 V155" className="visual-wire" />
            <circle
              cx="92"
              cy="118"
              r="13"
              className="visual-box trace-selected"
            />
            <text x="92" y="122" textAnchor="middle" className="visual-label">
              ↗
            </text>
            <path d="M106 118 H245" className="visual-wire trace-path" />
            <g className="trace-proof">
              <rect
                x="245"
                y="34"
                width="295"
                height="174"
                rx="12"
                className="visual-box"
              />
              <text x="265" y="63" className="visual-label">
                Beleg ansehen
              </text>
              <text x="265" y="91" className="visual-detail">
                DruckService.java · schematisch
              </text>
              <rect
                x="259"
                y="107"
                width="266"
                height="31"
                rx="5"
                className="trace-line"
              />
              <text x="269" y="128" className="visual-code">
                ladeVorlage(vorlagenId);
              </text>
              <text x="265" y="176" className="visual-detail">
                Quelle statt bloßer Behauptung
              </text>
            </g>
          </>
        )}
      </svg>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        Vereinfachtes Beispiel
      </p>
    </div>
  );
}
