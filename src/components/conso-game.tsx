import { useEffect, useRef, useState } from "react";
import { mountGame, type Action, type Mode } from "@/game/engine";

export function ConsoGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const api = useRef<ReturnType<typeof mountGame> | null>(null);
  const [mode, setMode] = useState<Mode>("title");
  const [best, setBest] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = mountGame(canvas, {
      onMode: (next, score) => {
        setMode(next);
        setBest(score);
      },
    });
    api.current = game;
    return () => game.destroy();
  }, []);

  const hold = (action: Action, down: boolean) => api.current?.setHeld(action, down);

  const showCard = mode === "title" || mode === "over" || mode === "win";

  return (
    <main className="game-page">
      <header className="game-header">
        <p className="game-wordmark">CONSO BOTS ADVENTURE</p>
        <p className="game-tagline">A white bear fights the bots.</p>
      </header>
      <div className="game-stage">
        <canvas
          ref={canvasRef}
          id="game"
          width={800}
          height={448}
          className="pixel-screen"
          onPointerDown={() => {
            if (showCard) api.current?.start();
          }}
        />
        {showCard ? (
          <div className="game-overlay" onClick={() => api.current?.start()}>
            <div className="game-card">
              <p className="game-kicker">CONSO BOTS ADVENTURE</p>
              <h1 className="game-title">
                {mode === "win" ? "Fortress reached" : mode === "over" ? "Game over" : "Ready to jump"}
              </h1>
              <p className="game-copy">
                {mode === "title"
                  ? "Hit gold blocks from below. Plus blocks release a power-up: grow bigger and break bricks. A bot hit only shrinks Big Conso."
                  : mode === "win"
                    ? "You reached the flag. Play the stage again."
                    : "No lives left. Your best score is saved on this device."}
              </p>
              {best > 0 ? <p className="game-best">BEST SCORE {String(best).padStart(6, "0")}</p> : null}
              <button
                type="button"
                className="game-start"
                onClick={() => api.current?.start()}
              >
                {mode === "title" ? "Play" : "Play again"}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div id="touch" className="touch-controls">
        <div className="touch-group">
          <Touch label="Left" action="left" onHold={hold} />
          <Touch label="Right" action="right" onHold={hold} />
        </div>
        <div className="touch-group">
          <Touch label="Jump" action="jump" onHold={hold} />
        </div>
      </div>

      <p className="controls-note">
        Controls : WASD To Move & Space To Jump.
      </p>
      <p className="game-credit">
        MADE BY NEMV{" "}
        <a
          className="credit-link"
          href="https://x.com/callmenemv"
          target="_blank"
          rel="noreferrer"
        >
          @CALLMENEMV
        </a>
      </p>
    </main>
  );
}

function Touch({
  label,
  action,
  onHold,
}: {
  label: string;
  action: Action;
  onHold: (action: Action, down: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="touch-button"
      onPointerDown={(e) => {
        e.preventDefault();
        onHold(action, true);
      }}
      onPointerUp={() => onHold(action, false)}
      onPointerLeave={() => onHold(action, false)}
      onPointerCancel={() => onHold(action, false)}
    >
      {label}
    </button>
  );
}
