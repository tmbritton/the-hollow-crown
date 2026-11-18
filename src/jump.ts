export const JUMP_GRAVITY = 20;
export const JUMP_SPEED = 6.4;
export const JUMP_PRELOAD = 1 / 30;

/** Continuous vertical motion above the navigation support plane. Phase is derived
 * from the trajectory, never a second animation clock or a wall-clock timer. */
export class Jump {
  height = 0;
  velocity = 0;
  preload = 0;
  landingAge = Infinity;
  landingSpeed = 0;
  landings = 0;
  held = false;

  get airborne() {
    return this.height > 0 || this.velocity > 0;
  }
  get active() {
    return this.preload > 0 || this.airborne;
  }
  get phase() {
    return this.preload > 0
      ? 'anticipation'
      : this.airborne
        ? this.velocity > 0
          ? 'rising'
          : 'falling'
        : this.landingAge < 0.3
          ? 'landing'
          : 'grounded';
  }

  request(): boolean {
    if (this.active || this.landingAge < 0.08) return false;
    this.preload = JUMP_PRELOAD;
    return true;
  }

  /** Exact constant-gravity integration, including time left after takeoff/contact.
   * Subtracting a support change keeps world-space flight continuous over stairs. */
  advance(dt: number, supportChange = 0): void {
    if (dt <= 0) return;
    this.landingAge += dt;
    if (this.airborne) this.height -= supportChange;
    if (this.preload > 0) {
      const waiting = Math.min(this.preload, dt);
      this.preload = Math.max(0, this.preload - waiting);
      dt -= waiting;
      if (this.preload > 1e-9) return;
      this.preload = 0;
      this.velocity = JUMP_SPEED;
    }
    if (!this.airborne && this.height >= 0) return;
    const contact =
      this.height < 0
        ? 0
        : (this.velocity +
            Math.sqrt(this.velocity * this.velocity + 2 * JUMP_GRAVITY * this.height)) /
          JUMP_GRAVITY;
    if (contact <= dt) {
      this.landingSpeed = Math.max(0, JUMP_GRAVITY * contact - this.velocity);
      this.landingAge = dt - contact;
      this.landings++;
      this.height = this.velocity = 0;
    } else {
      this.height += this.velocity * dt - 0.5 * JUMP_GRAVITY * dt * dt;
      this.velocity -= JUMP_GRAVITY * dt;
    }
  }
}
