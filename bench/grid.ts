/**
 * Shared bench page: a parametrizable grid of cards used as tour targets,
 * an unrelated fixed scrollable container (its scroll events reach the
 * window capture listener but never move a tour target) and a tall spacer
 * so window scrolling matters.
 */
export interface BenchParams {
  targets: number;
  steps: number;
}

export function benchParams(): BenchParams {
  const q = new URLSearchParams(location.search);
  return {
    targets: Math.max(1, Number(q.get("targets")) || 40),
    steps: Math.max(2, Number(q.get("steps")) || 12),
  };
}

export function buildGrid(count: number): void {
  const app = document.getElementById("app")!;

  const heading = document.createElement("h1");
  heading.textContent = "Benchmark stand";

  const grid = document.createElement("div");
  grid.className = "bench-grid";
  for (let i = 0; i < count; i++) {
    const card = document.createElement("section");
    card.className = "bench-card";
    card.id = `card-${i}`;

    const title = document.createElement("h3");
    title.textContent = `Card ${i}`;
    const text = document.createElement("p");
    text.textContent = "Static content used as a spotlight target.";

    card.append(title, text);
    grid.append(card);
  }

  // Fixed side scroller: its scroll events reach a window capture listener.
  // For the main tour it is pure noise (no tour target inside moves); the
  // nested-alignment scenario targets the card in the middle of it.
  const side = document.createElement("div");
  side.className = "bench-side";
  side.id = "side-scroller";

  const padTop = document.createElement("div");
  padTop.className = "bench-side__pad";
  const nested = document.createElement("section");
  nested.className = "bench-card";
  nested.id = "nested-card";
  const nestedTitle = document.createElement("h3");
  nestedTitle.textContent = "Nested card";
  const nestedText = document.createElement("p");
  nestedText.textContent = "Lives inside a scrollable container.";
  nested.append(nestedTitle, nestedText);
  const padBottom = document.createElement("div");
  padBottom.className = "bench-side__pad";
  side.append(padTop, nested, padBottom);

  const spacer = document.createElement("div");
  spacer.className = "bench-spacer";

  app.append(heading, grid, side, spacer);
}

/** Spreads `steps` tour targets evenly across the `targets` cards. */
export function stepTargetIds(targets: number, steps: number): string[] {
  const ids: string[] = [];
  for (let i = 0; i < steps; i++) {
    const card = Math.min(targets - 1, Math.round((i * (targets - 1)) / Math.max(1, steps - 1)));
    ids.push(`card-${card}`);
  }
  return ids;
}
