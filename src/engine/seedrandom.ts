// Deterministic seeded PRNG for reproducible simulation
// Mulberry32 - fast, good distribution, 2^32 period

export class SeededRNG {
  private state: number;

  constructor(seed: number = Date.now()) {
    this.state = seed >>> 0;
  }

  // Mulberry32 algorithm
  next(): number {
    this.state = (this.state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Uniform integer in [min, max)
  nextInt(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min));
  }

  // Uniform float in [min, max)
  nextFloat(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  // Gaussian/normal distribution (Box-Muller)
  nextGaussian(mean: number = 0, stdDev: number = 1): number {
    const u1 = this.next();
    const u2 = this.next();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * stdDev;
  }

  // Weighted random choice
  weightedChoice<T>(items: T[], weights: number[]): T {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  // Shuffle array in place (Fisher-Yates)
  shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i + 1);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  // Get/set state for serialization
  getState(): number {
    return this.state;
  }

  setState(state: number): void {
    this.state = state >>> 0;
  }

  // Create independent child RNG
  fork(): SeededRNG {
    return new SeededRNG(this.nextInt(0, 0xFFFFFFFF));
  }
}

// Global simulation RNG instance
export const simRNG = new SeededRNG(2916983006);