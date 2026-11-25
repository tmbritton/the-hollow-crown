import { smoothStep } from './animationCurves.ts';

type Hit = { sequence: number; time: number };

export class PlayerHurt {
  private latest: Hit | null = null;
  private sequence = 0;

  get sample(): Readonly<Hit> | null {
    return this.latest;
  }
  publish(time: number) {
    this.latest = { sequence: ++this.sequence, time };
  }
  reset() {
    this.latest = null;
  }
}

export function hurtWeight(age: number): number {
  if (age < 0 || age >= 0.18) return 0;
  // The first fixed-step presentation already shows a small recoil.
  return age <= 0.035
    ? 0.22 + 0.78 * smoothStep(age / 0.035)
    : 1 - smoothStep((age - 0.035) / 0.145);
}
