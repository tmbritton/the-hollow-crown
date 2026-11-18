import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Statechart } from './machines/statechart.ts';
import { inspectionMachine } from './machines/ui/inspection.ts';

export interface InspectionView {
  focus: Vector3;
  /** Direction from the object toward the viewer. */
  direction: Vector3;
  distance?: number;
  width?: number;
  height?: number;
}

export interface InspectionTarget {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  getView(): InspectionView;
  onEnter?(): void;
  onExit?(): void;
}

/** The camera surface we need; also usable with lightweight test cameras. */
export interface CameraPose {
  target: Vector3;
  alpha: number;
  beta: number;
  radius: number;
  fov: number;
  minZ: number;
}
export interface InspectionViewport {
  width: number;
  height: number;
  footer?: number;
}
export interface InspectionOptions {
  getViewport?: () => InspectionViewport;
  onOpen?: (target: InspectionTarget) => void;
  onClose?: (target: InspectionTarget) => void;
  duration?: number;
}
export interface InspectionSession {
  target: InspectionTarget;
  saved: CameraPose;
  from: CameraPose;
  elapsed: number;
}

/** Target hooks own presentation changes; application hooks own UI/input. */
export class InspectionController {
  readonly chart: Statechart<typeof inspectionMachine>;
  private get session() {
    return this.chart.snapshot.context.session;
  }
  private readonly camera: CameraPose;
  private readonly getViewport: () => InspectionViewport;
  private readonly onOpen: (target: InspectionTarget) => void;
  private readonly onClose: (target: InspectionTarget) => void;
  private readonly duration: number;

  constructor(
    camera: CameraPose,
    { getViewport, onOpen = () => {}, onClose = () => {}, duration = 0.55 }: InspectionOptions = {},
  ) {
    this.camera = camera;
    this.getViewport = getViewport || (() => ({ width: 1280, height: 720, footer: 180 }));
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.duration = duration;
    this.chart = new Statechart(inspectionMachine, { duration });
  }
  get active(): boolean {
    return this.session !== null;
  }
  get state() {
    return this.chart.snapshot.value;
  }
  get target(): InspectionTarget | null {
    return this.session?.target ?? null;
  }
  get saved(): CameraPose | null {
    return this.session?.saved ?? null;
  }
  capture(): CameraPose {
    const c = this.camera;
    return {
      target: c.target.clone(),
      alpha: c.alpha,
      beta: c.beta,
      radius: c.radius,
      fov: c.fov,
      minZ: c.minZ,
    };
  }
  private apply(pose: CameraPose): void {
    const c = this.camera;
    c.target.copyFrom(pose.target);
    c.alpha = pose.alpha;
    c.beta = pose.beta;
    c.radius = pose.radius;
    c.fov = pose.fov;
    c.minZ = pose.minZ;
  }
  private viewPose(session: InspectionSession): CameraPose {
    const view = session.target.getView(),
      viewport = this.getViewport();
    const direction = view.direction.clone().normalize();
    const width = Math.max(1, viewport.width),
      height = Math.max(1, viewport.height);
    const footer = viewport.footer ?? 180,
      top = 40;
    const visibleHeight = Math.max(height * 0.3, height - footer - top);
    const distance = view.distance ?? 2.5;
    const halfHeight = Math.max(
      ((view.height ?? 2) * height) / visibleHeight / 2,
      (view.width ?? 2) / (width / height) / 0.88 / 2,
    );
    const fov = Math.max(0.35, Math.min(1.6, 2 * Math.atan(halfHeight / distance)));
    const shift = Math.max(0, (footer - top) / height) * distance * Math.tan(fov / 2);
    const focus = view.focus.subtract(new Vector3(0, shift, 0));
    return {
      target: focus,
      alpha: Math.atan2(direction.z, direction.x),
      beta: Math.acos(Math.max(-0.9999, Math.min(0.9999, direction.y))),
      radius: distance,
      fov,
      minZ: Math.min(session.saved.minZ, 0.08),
    };
  }
  open(target: InspectionTarget): boolean {
    if (this.active) return false;
    const saved = this.capture();
    this.chart.send({ type: 'OPEN', session: { saved, from: saved, target, elapsed: 0 } });
    target.onEnter?.();
    this.onOpen(target);
    return true;
  }
  close({ immediate = false }: { immediate?: boolean } = {}): boolean {
    const session = this.session;
    if (!session) return false;
    const before = this.state;
    this.chart.send({ type: 'CLOSE', immediate, from: this.capture() });
    if (this.state === 'idle') this.finish(session);
    return this.state !== before;
  }
  update(dt: number): void {
    const session = this.session;
    if (!session) return;
    const phase = this.state;
    if (phase === 'viewing') {
      this.apply(this.viewPose(session));
      return;
    }
    this.chart.send({ type: 'TICK', dt });
    const t =
        this.duration <= 0 ? 1 : Math.min(1, (session.elapsed + Math.max(0, dt)) / this.duration),
      ease = t * t * (3 - 2 * t);
    const to = phase === 'leaving' ? session.saved : this.viewPose(session),
      from = session.from;
    const angle = Math.atan2(Math.sin(to.alpha - from.alpha), Math.cos(to.alpha - from.alpha));
    this.apply({
      target: Vector3.Lerp(from.target, to.target, ease),
      alpha: from.alpha + angle * ease,
      beta: from.beta + (to.beta - from.beta) * ease,
      radius: from.radius + (to.radius - from.radius) * ease,
      fov: from.fov + (to.fov - from.fov) * ease,
      minZ: to.minZ,
    });
    if (this.state === 'idle') this.finish(session);
    else if (this.state === 'viewing') this.apply(to);
  }
  private finish(session: InspectionSession): void {
    const { target, saved } = session;
    this.apply(saved);
    target.onExit?.();
    this.onClose(target);
  }
  dispose(): void {
    if (this.active) this.close({ immediate: true });
  }
}
