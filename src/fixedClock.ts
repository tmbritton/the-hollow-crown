export function createFixedClock(now: number) {
  let last = now;
  return {
    remainder: 0,
    reset(now: number) {
      last = now;
      this.remainder = 0;
    },
    elapsed(now: number) {
      const dt = Math.min(0.08, (now - last) / 1000);
      last = now;
      return dt;
    },
    advance(now: number) {
      this.remainder += this.elapsed(now);
    },
    take() {
      if (this.remainder < 1 / 60) return false;
      this.remainder -= 1 / 60;
      return true;
    },
  };
}
