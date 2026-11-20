import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Statechart } from '../src/machines/statechart.ts';
import { createMonsterBehavior } from '../src/machines/monsters/index.ts';
import type { MonsterPerception } from '../src/machines/monsters/types.ts';
import { Attack } from '../src/machines/actors/attack.ts';
import { Health } from '../src/machines/actors/health.ts';
import { sessionMachine } from '../src/machines/ui/session.ts';
import { pointerMachine } from '../src/machines/ui/pointer.ts';
import { inspectorMachine } from '../src/machines/ui/inspector.ts';
import { feedbackMachine } from '../src/machines/ui/feedback.ts';
import {
  animateDoor,
  bindDoor,
  bindChest,
  animateChest,
  progressionMachine,
} from '../src/machines/world/interactions.ts';
import type { ChestEntity, DoorEntity } from '../src/worldTypes.ts';

const perception = (changes: Partial<MonsterPerception> = {}): MonsterPerception => ({
  type: 'THINK',
  hasTarget: true,
  navigating: false,
  threatened: false,
  swinging: false,
  hidden: false,
  rested: true,
  readyToShoot: true,
  coolingDown: false,
  regroup: false,
  melee: false,
  atHome: true,
  activity: 'smoke',
  ...changes,
});

test('different monster charts interpret the same perception through their own tactics', () => {
  const skeleton = createMonsterBehavior('skeleton');
  const goblin = createMonsterBehavior('goblin');
  const kobold = createMonsterBehavior('kobold');
  const facts = perception();
  assert.deepEqual(
    skeleton.send(facts).map((a) => a.type),
    ['chase'],
  );
  assert.deepEqual(
    goblin.send(facts).map((a) => a.type),
    ['shoot'],
  );
  assert.deepEqual(
    kobold.send(facts).map((a) => a.type),
    ['flank'],
  );
  assert.deepEqual(
    [skeleton.snapshot.value, goblin.snapshot.value, kobold.snapshot.value],
    ['chase', 'attack', 'flank'],
  );

  // Threat reaction wins over completing an unlaunched shot; it cannot affect peers.
  assert.deepEqual(
    goblin.send(perception({ threatened: true, swinging: true })).map((a) => a.type),
    ['flee'],
  );
  assert.equal(skeleton.snapshot.value, 'chase');
  assert.equal(kobold.snapshot.value, 'flank');
  assert.deepEqual(
    kobold.send(perception({ regroup: true, melee: true })).map((a) => a.type),
    ['regroup'],
  );
});

test('dead monster brains cannot issue movement or attacks and new instances are independent', () => {
  for (const kind of ['skeleton', 'goblin', 'kobold'] as const) {
    const brain = createMonsterBehavior(kind);
    brain.send({ type: 'DIE' });
    assert.deepEqual(brain.send(perception()), []);
    assert.deepEqual(brain.send({ type: 'ENGAGE', melee: true, swinging: false }), []);
    assert.equal(brain.snapshot.value, 'dead');
    assert.notEqual(createMonsterBehavior(kind).snapshot.value, 'dead');
    brain.send({ type: 'REVIVE' });
    assert.notEqual(brain.snapshot.value, 'dead');
  }
});

test('attack impact is exactly once even when a tick crosses wind-up and recovery', () => {
  const attack = new Attack();
  const swing = {
    target: 'enemy',
    elapsed: 0,
    duration: 0.62,
    impact: 0.25,
    kind: 'MELEE' as const,
    resolved: false,
  };
  attack.target = 'enemy';
  assert.ok(attack.start(swing, 0.64));
  assert.equal(attack.advance(0.24), null);
  assert.equal(attack.advance(1)?.target, 'enemy');
  assert.equal(attack.swing, null);
  assert.equal(attack.advance(1), null);
  assert.equal(attack.start(swing, 0.64), false, 'action recovery and cooldown are independent');
  attack.cool(0.64);
  assert.ok(attack.start(swing, 0.64));
  attack.cancel();
  assert.equal(attack.advance(1), null, 'cancelled wind-up cannot deal delayed damage');
  assert.equal(attack.cooldown, 0.64, 'cancellation must not refund a cooldown');
  attack.die();
  attack.cool(10);
  assert.equal(attack.start(swing, 0.64), false);
  attack.reset();
  assert.ok(attack.start(swing, 0.64));
});

test('pursuit and door commands replace each other and death clears both', () => {
  const attack = new Attack();
  attack.target = 'enemy';
  attack.interact('door');
  assert.equal(attack.target, null);
  assert.equal(attack.interaction, 'door');
  attack.target = 'other';
  assert.equal(attack.interaction, null);
  attack.releaseInteraction();
  assert.equal(attack.target, 'other', 'completing a stale door intent cannot clear pursuit');
  attack.die();
  attack.target = 'enemy';
  attack.interact('door');
  assert.equal(attack.target, null);
  assert.equal(attack.interaction, null);
  attack.reset();
  assert.equal(attack.command.snapshot.value, 'idle');
});

test('respawn protection expires only through simulation ticks and cannot revive a corpse', () => {
  const health = new Health(100);
  health.invulnerable = 2.5;
  assert.equal(health.damage(100), false);
  health.advance(2.49);
  assert.equal(health.damage(100), false);
  health.advance(0.02);
  assert.ok(health.damage(100));
  assert.equal(health.current, 0);
  health.invulnerable = 1;
  health.advance(10);
  assert.equal(health.chart.snapshot.value, 'dead');
  assert.equal(health.damage(10), false);
  health.current = 100;
  health.invulnerable = 2.5;
  assert.equal(health.chart.snapshot.value, 'protected');
});

test('runtime door charts preserve locks, reopen occupied closures, and expose one authoritative view', () => {
  const door: DoorEntity = {
    id: 'gate',
    type: 'door',
    x: 0,
    z: 0,
    h: 0,
    axis: 'x',
    requiresAltar: true,
    locked: true,
    open: false,
  };
  const chart = bindDoor(door);
  door.open = true;
  animateDoor(door, false, 1);
  assert.equal(door.open, false);
  door.locked = false;
  door.open = true;
  for (let i = 0; i < 120; i++) animateDoor(door, false, 1 / 60);
  assert.ok(door.open && door.angle! > 1.2);
  door.open = false;
  animateDoor(door, true, 1 / 60);
  assert.equal(door.open, true, 'an actor entering the doorway reverses closing');
  door.locked = true;
  assert.equal(door.open, false);
  assert.equal(chart.snapshot.value, 'locked');
  assert.equal(bindDoor(door), chart);
});

test('chests remain claimed during animation and progression cannot skip the altar', () => {
  const chest: ChestEntity = {
    id: 'relic',
    type: 'chest',
    x: 0,
    z: 0,
    h: 0,
    w: 1,
    d: 1,
    rotation: 0,
    variant: 0,
    room: 'treasury',
    approach: { x: 0, z: 1 },
    open: false,
  };
  const chart = bindChest(chest);
  chest.open = true;
  assert.ok(chest.open, 'reward is claimed before the lid finishes opening');
  chest.open = false;
  assert.ok(chest.open, 'a claimed chest cannot accidentally award again');
  for (let i = 0; i < 120; i++) animateChest(chest, 1 / 60);
  assert.equal(chart.snapshot.value, 'open');
  const progression = new Statechart(progressionMachine);
  progression.send({ type: 'CLAIM' });
  assert.equal(progression.snapshot.value, 'seekingAltar');
  progression.send({ type: 'KINDLE' });
  progression.send({ type: 'CLAIM' });
  progression.send({ type: 'KINDLE' });
  assert.equal(progression.snapshot.value, 'complete');
});

test('tab visibility preserves modal mode and stale close events cannot interrupt loading', () => {
  const flow = new Statechart(sessionMachine);
  flow.send({ type: 'READY' });
  flow.send({ type: 'TOGGLE_MENU' });
  flow.send({ type: 'HIDE' });
  flow.send({ type: 'SHOW' });
  assert.ok(flow.snapshot.matches({ mode: 'menu', visibility: 'visible' }));
  flow.send({ type: 'CLOSE_MENU' });
  flow.send({ type: 'INSPECT' });
  flow.send({ type: 'LOAD' });
  flow.send({ type: 'CLOSE_INSPECTION' });
  flow.send({ type: 'CLOSE_MENU' });
  assert.ok(flow.snapshot.matches({ mode: 'loading' }));
  flow.send({ type: 'READY' });
  flow.send({ type: 'VICTORY' });
  flow.send({ type: 'TOGGLE_MENU' });
  assert.ok(flow.snapshot.matches({ mode: 'victory' }));
  flow.send({ type: 'CONTINUE' });
  assert.ok(flow.snapshot.matches({ mode: 'playing' }));
});

test('held target pointer ignores unrelated pointers and never turns into floor steering', () => {
  const pointer = new Statechart(pointerMachine);
  pointer.send({ type: 'DOWN', pointer: { id: 1, x: 10, y: 20 } });
  pointer.send({ type: 'SELECT_TARGET' });
  pointer.send({ type: 'MOVE', pointer: { id: 2, x: 90, y: 90 }, pressed: true });
  pointer.send({ type: 'UP', id: 2 });
  assert.deepEqual(pointer.snapshot.context.pointer, { id: 1, x: 10, y: 20 });
  pointer.send({ type: 'MOVE', pointer: { id: 1, x: 30, y: 40 }, pressed: true });
  assert.equal(pointer.snapshot.value, 'target');
  pointer.send({ type: 'MOVE', pointer: { id: 1, x: 30, y: 40 }, pressed: false });
  assert.equal(pointer.snapshot.value, 'idle');
  assert.equal(pointer.snapshot.context.pointer, null);
});

test('cancelled inspector imports cannot reopen an inspector on a regenerated scene', () => {
  const inspector = new Statechart(inspectorMachine);
  inspector.send({ type: 'TOGGLE' });
  const oldRequest = inspector.snapshot.context.request;
  inspector.send({ type: 'CLOSE' });
  inspector.send({ type: 'TOGGLE' });
  inspector.send({ type: 'RESOLVE', request: oldRequest });
  assert.equal(inspector.snapshot.value, 'loading');
  inspector.send({ type: 'REJECT', request: oldRequest });
  assert.equal(inspector.snapshot.value, 'loading');
  inspector.send({ type: 'RESOLVE', request: inspector.snapshot.context.request });
  assert.equal(inspector.snapshot.value, 'open');
});

test('replacing a transient UI message extends its deadline without stale timeout callbacks', () => {
  const feedback = new Statechart(feedbackMachine);
  feedback.send({ type: 'SHOW', now: 0, duration: 100 });
  feedback.send({ type: 'SHOW', now: 80, duration: 200 });
  feedback.send({ type: 'TICK', now: 100 });
  assert.equal(feedback.snapshot.value, 'visible');
  feedback.send({ type: 'TICK', now: 280 });
  assert.equal(feedback.snapshot.value, 'hidden');
});
