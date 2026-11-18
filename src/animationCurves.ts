export type PoseCurve = readonly (readonly [time: number, value: number])[];

export function smoothStep(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

/** Authored beats with continuous position and velocity, including overshoot/settle. */
export function sampleCurve(time: number, keys: PoseCurve): number {
  if (time <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [end, value] = keys[i];
    if (time > end) continue;
    if (time === end) return value;
    const [start, previous] = keys[i - 1];
    return previous + (value - previous) * smoothStep((time - start) / (end - start));
  }
  return keys[keys.length - 1][1];
}

/** Local Y is the loading axis; Z is forward. Compensate X to preserve volume. */
export function volumeScale(height: number, forward: number) {
  return { x: 1 / (height * forward), y: height, z: forward };
}

/** Closed-form underdamped spring: stable and frame-rate independent even on a long tick. */
export class Spring {
  value: number;
  velocity = 0;
  constructor(value = 0) {
    this.value = value;
  }
  advance(target: number, dt: number, frequency = 18, damping = 0.68): number {
    const decay = frequency * damping;
    const oscillation = frequency * Math.sqrt(1 - damping * damping);
    const offset = this.value - target;
    const sineWeight = (this.velocity + decay * offset) / oscillation;
    const sin = Math.sin(oscillation * dt),
      cos = Math.cos(oscillation * dt);
    const envelope = Math.exp(-decay * dt);
    this.value = target + envelope * (offset * cos + sineWeight * sin);
    this.velocity =
      envelope * (this.velocity * cos - (decay * sineWeight + oscillation * offset) * sin);
    return this.value;
  }
}

/** Shape-preserving Hermite interpolation carries momentum through intermediate keys.
 * Only extrema stop; a contact pose along a sword cut is not an ease-to-zero point. */
export function sampleMotionCurve(time: number, keys: PoseCurve): number {
  if (time <= keys[0][0]) return keys[0][1];
  const tangent = (i: number) => {
    if (i === 0 || i === keys.length - 1) return 0;
    const left = (keys[i][1] - keys[i - 1][1]) / (keys[i][0] - keys[i - 1][0]);
    const right = (keys[i + 1][1] - keys[i][1]) / (keys[i + 1][0] - keys[i][0]);
    return left * right <= 0 ? 0 : (2 * left * right) / (left + right);
  };
  for (let i = 1; i < keys.length; i++) {
    const [end, b] = keys[i],
      [start, a] = keys[i - 1];
    if (time > end) continue;
    const duration = end - start,
      t = (time - start) / duration;
    return (
      (2 * t ** 3 - 3 * t ** 2 + 1) * a +
      (t ** 3 - 2 * t ** 2 + t) * duration * tangent(i - 1) +
      (-2 * t ** 3 + 3 * t ** 2) * b +
      (t ** 3 - t ** 2) * duration * tangent(i)
    );
  }
  return keys[keys.length - 1][1];
}
