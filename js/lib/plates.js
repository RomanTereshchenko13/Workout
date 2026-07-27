/**
 * Adjustable-dumbbell plate math.
 *
 * The owner's inventory:
 *   2 threaded bars, 35 cm (~2 kg each including nuts)
 *   4 × 2 kg, 4 × 3 kg, 4 × 4 kg plates (36 kg of plates, Ø160 mm, bare steel)
 *   Total: two 20 kg dumbbells
 *
 * Loading modes:
 *   'pair'   — both dumbbells loaded identically (presses, two-arm rows).
 *              Per denomination that consumes 4 plates (2 sides × 2 dumbbells).
 *   'single' — one dumbbell only (goblet squat, one-arm row, swings).
 *              Per denomination that consumes 2 plates (2 sides × 1 dumbbell).
 */

export const DEFAULT_INVENTORY = {
  barKg: 2,
  plates: { 2: 4, 3: 4, 4: 4 },
  /** Ceiling for a single dumbbell — this set is designed for 20 kg. */
  maxPerDumbbellKg: 20,
  /** A 35 cm bar physically fits ~3 plates (Ø160 mm) per side. */
  maxPlatesPerSide: 3,
};

/** How many plates of one denomination fit PER SIDE in this mode. */
function perSideLimit(count, mode) {
  return Math.floor(count / (mode === 'pair' ? 4 : 2));
}

/**
 * Every weight a single dumbbell can be loaded to in the given mode.
 * @returns {Array<{kg:number, side:Object<string,number>, plates:number}>} sorted by weight
 */
export function achievableLoads(inventory = DEFAULT_INVENTORY, mode = 'pair') {
  const denoms = Object.keys(inventory.plates)
    .map(Number)
    .filter((d) => d > 0 && inventory.plates[d] > 0)
    .sort((a, b) => b - a);

  const limits = denoms.map((d) => perSideLimit(inventory.plates[d], mode));
  const maxKg = inventory.maxPerDumbbellKg ?? Infinity;
  const maxSide = inventory.maxPlatesPerSide ?? Infinity;
  const best = new Map(); // kg -> the variant that uses the fewest plates

  const walk = (i, side, sideKg, plateCount) => {
    const kgNow = inventory.barKg + sideKg * 2;
    if (kgNow > maxKg + 0.01 || plateCount > maxSide) return;
    if (i === denoms.length) {
      const kg = round(kgNow);
      const prev = best.get(kg);
      if (!prev || plateCount < prev.plates) {
        best.set(kg, { kg, side: { ...side }, plates: plateCount });
      }
      return;
    }
    const d = denoms[i];
    for (let n = 0; n <= limits[i]; n++) {
      if (n > 0) side[d] = n;
      else delete side[d];
      walk(i + 1, side, sideKg + d * n, plateCount + n);
    }
    delete side[d];
  };

  walk(0, {}, 0, 0);
  return [...best.values()].sort((a, b) => a.kg - b.kg);
}

/** Closest achievable weight to a target. prefer: 'any' | 'up' | 'down' */
export function nearestLoad(target, inventory = DEFAULT_INVENTORY, mode = 'pair', prefer = 'any') {
  const loads = achievableLoads(inventory, mode);
  const pool =
    prefer === 'up'
      ? loads.filter((l) => l.kg >= target)
      : prefer === 'down'
        ? loads.filter((l) => l.kg <= target)
        : loads;
  const list = pool.length ? pool : loads;
  return list.reduce((a, b) => (Math.abs(b.kg - target) < Math.abs(a.kg - target) ? b : a));
}

/** Next step up from the current weight (drives progression). */
export function nextLoadUp(current, inventory = DEFAULT_INVENTORY, mode = 'pair') {
  const loads = achievableLoads(inventory, mode);
  return loads.find((l) => l.kg > current + 0.01) || loads[loads.length - 1];
}

/** Next step down. */
export function nextLoadDown(current, inventory = DEFAULT_INVENTORY, mode = 'pair') {
  const loads = achievableLoads(inventory, mode).filter((l) => l.kg < current - 0.01);
  return loads.length ? loads[loads.length - 1] : null;
}

/** Loading spelled out for the UI (Ukrainian): «Гриф 2 кг + по 4+3 кг з кожної сторони». */
export function describeLoad(load, inventory = DEFAULT_INVENTORY, mode = 'pair') {
  if (!load) return '—';
  const who = mode === 'pair' ? 'на кожну гантель' : 'на одну гантель';
  const parts = Object.keys(load.side)
    .map(Number)
    .sort((a, b) => b - a)
    .flatMap((d) => Array.from({ length: load.side[d] }, () => `${d}`));
  if (!parts.length) return `Тільки гриф (${inventory.barKg} кг) — ${who}`;
  return `Гриф ${inventory.barKg} кг + по ${parts.join('+')} кг з кожної сторони — ${who}`;
}

/** Compact form for tight spaces: «2 + 4+3 ×2». */
export function shortLoad(load, inventory = DEFAULT_INVENTORY) {
  if (!load) return '—';
  const parts = Object.keys(load.side)
    .map(Number)
    .sort((a, b) => b - a)
    .flatMap((d) => Array.from({ length: load.side[d] }, () => `${d}`));
  if (!parts.length) return `гриф ${inventory.barKg}`;
  return `${inventory.barKg} + ${parts.join('+')} ×2`;
}

/** Total plates consumed per denomination. */
export function plateUsage(load, mode = 'pair') {
  const mult = mode === 'pair' ? 4 : 2;
  const out = {};
  for (const [d, n] of Object.entries(load.side)) out[d] = n * mult;
  return out;
}

/** Whether the inventory actually holds enough plates for this loading. */
export function fitsInventory(load, inventory = DEFAULT_INVENTORY, mode = 'pair') {
  const usage = plateUsage(load, mode);
  return Object.entries(usage).every(([d, n]) => (inventory.plates[d] || 0) >= n);
}

/** Heaviest single dumbbell achievable in this mode. */
export function maxLoad(inventory = DEFAULT_INVENTORY, mode = 'pair') {
  const loads = achievableLoads(inventory, mode);
  return loads[loads.length - 1].kg;
}

/** Kilograms actually moved per rep (a pair of dumbbells counts double). */
export function liftedPerRep(kg, mode) {
  return mode === 'pair' ? kg * 2 : kg;
}

export function round(n) {
  return Math.round(n * 100) / 100;
}
