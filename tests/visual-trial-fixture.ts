type Input =
  | { tick: number; floor: [number, number] }
  | { tick: number; door: string }
  | { tick: number; foe: string };

export const routes = {
  practice: {
    query: '?debug&room=practice',
    inputs: [
      { tick: 0, floor: [-6, -4] },
      { tick: 120, door: 'practice-door' },
      { tick: 300, foe: 'skeleton:practice:0' },
    ] as Input[],
    clipStart: 64,
    still: 344,
  },
  dungeon: {
    query: '?debug&seed=MOURNING-731',
    inputs: [
      { tick: 0, floor: [-8, -4] }, // portrait-15 at (-9.43, -4)
      { tick: 180, floor: [-1, 24] }, // passage-13, stair tile (-1, 14), into Bakery
      { tick: 590, foe: 'goblin:bakery:0' },
    ] as Input[],
    clipStart: 408,
    still: 680,
  },
};

export const view = { width: 1280, height: 720, alpha: -Math.PI / 4, beta: 0.64 };
export const recipe = { lensDegrees: 60, fisheyePercent: 100 };
export const budget = { p95Ms: 2, meanDraws: 1 };

export function captureCamera(d: DungeonDebug): CaptureCamera {
  const { game, engine } = d;
  const { camera } = game;
  if (game.scene.activeCamera !== camera) throw Error('Unexpected active capture camera');
  const width = engine.getRenderWidth(true);
  const height = engine.getRenderHeight(true);
  const sample = game.visualTrial?.pick(width * 0.75, height * 0.5, width, height);
  return {
    alpha: camera.alpha,
    beta: camera.beta,
    logicalRadius: game.logicalRadius ?? camera.radius,
    radius: camera.radius,
    fov: camera.fov,
    target: camera.target.asArray(),
    distortion: camera._postProcesses.some(
      (pass) => pass?.name === 'Visual trial fisheye' && pass.isReady(),
    ),
    sampleX: game.visualTrial ? (sample ? sample.x / width : null) : 0.75,
  };
}

export function advanceRoute(d: DungeonDebug, inputs: readonly Input[]) {
  const g = d.game;
  const hero = g.player.actor;
  const state = {
    tick: g.steps,
    actors: g.combat.actors.map((a) => ({
      id: a.id,
      pose: { ...a.position },
      hp: a.health.current,
      swing: a.attack.swing ? { ...a.attack.swing } : null,
      target: a.attack.target,
    })),
    doors: g.world.entities.flatMap((e) => (e.type === 'door' ? [[e.id, e.open]] : [])),
    target: hero.navigator.destination,
  };
  for (const input of inputs.filter((input) => input.tick === g.steps)) {
    if ('floor' in input)
      hero.navigator.request(hero.position, { x: input.floor[0], z: input.floor[1] });
    else if ('door' in input) {
      if (!g.combat.requestDoor(hero, input.door)) throw Error(`Invalid door ${input.door}`);
    } else {
      const foe = g.combat.actor(input.foe);
      if (!foe) throw Error(`Invalid foe ${input.foe}`);
      g.combat.target(hero, foe);
    }
  }
  d.step([]);
  return state;
}
import type { DungeonDebug } from '../src/gameTypes.ts';
import type { CaptureCamera } from './visual-trial-camera.ts';
