import assert from 'node:assert/strict';
import type { EventFromLogic } from 'xstate';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { modelCase } from './coverage.ts';
import { skeletonMachine } from '../../src/machines/monsters/skeleton.ts';
import { goblinMachine } from '../../src/machines/monsters/goblin.ts';
import { koboldMachine } from '../../src/machines/monsters/kobold.ts';
import type { MonsterEvent, MonsterPerception } from '../../src/machines/monsters/types.ts';
import { attackMachine } from '../../src/machines/actors/attack.ts';
import { defenseMachine } from '../../src/machines/actors/defense.ts';
import { commandMachine } from '../../src/machines/actors/command.ts';
import { healthMachine } from '../../src/machines/actors/health.ts';
import { locomotionMachine } from '../../src/machines/actors/locomotion.ts';
import { navigationMachine } from '../../src/machines/navigation/travel.ts';
import {
  doorMachine,
  chestMachine,
  progressionMachine,
} from '../../src/machines/world/interactions.ts';
import { inspectionMachine } from '../../src/machines/ui/inspection.ts';
import { sessionMachine } from '../../src/machines/ui/session.ts';
import { pointerMachine } from '../../src/machines/ui/pointer.ts';
import { inspectorMachine } from '../../src/machines/ui/inspector.ts';
import { feedbackMachine } from '../../src/machines/ui/feedback.ts';
import { objectiveMachine } from '../../src/machines/world/objective.ts';
import { workMachine } from '../../src/machines/actors/work.ts';
import { focusMachine } from '../../src/machines/world/focus.ts';
import { cargoMachine } from '../../src/machines/world/cargo.ts';

const facts = (changes: Partial<MonsterPerception> = {}): MonsterPerception => ({
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
const monsterEvents: MonsterEvent[] = [
  { type: 'DIE' },
  { type: 'REVIVE' },
  ...[false, true].flatMap((melee) =>
    [false, true].map((swinging): MonsterEvent => ({ type: 'ENGAGE', melee, swinging })),
  ),
  ...(['cards', 'hackysack', 'smoke'] as const).flatMap((activity) =>
    [false, true].flatMap((atHome) =>
      [false, true].map((navigating) => facts({ hasTarget: false, activity, atHome, navigating })),
    ),
  ),
  facts(),
  facts({ threatened: true, swinging: true }),
  facts({ swinging: true }),
  facts({ hidden: true, rested: false, readyToShoot: false }),
  facts({ hidden: false, coolingDown: true, readyToShoot: false }),
  facts({ hidden: true, rested: true, readyToShoot: false }),
  facts({ regroup: true, melee: true }),
  facts({ melee: true }),
];
const pose = {
  target: new Vector3(0, 1, 0),
  alpha: 0,
  beta: 0.6,
  radius: 20,
  fov: 0.65,
  minZ: 0.1,
};
const inspectionSession = {
  target: {
    id: 'tablet',
    title: 'Tablet',
    getView: () => ({ focus: new Vector3(0, 1, 0), direction: new Vector3(0, 0, 1) }),
  },
  saved: pose,
  from: pose,
  elapsed: 0,
};
const swing = {
  target: 'enemy',
  elapsed: 0,
  duration: 0.62,
  impact: 0.25,
  resolved: false,
  ranged: false,
};

export const modelCases = [
  modelCase(defenseMachine, {
    inputs: [undefined],
    events: (): EventFromLogic<typeof defenseMachine>[] => [
      ...[false, true].flatMap((eligible) =>
        [false, true].map((repeat) => ({ type: 'PRESS' as const, eligible, repeat })),
      ),
      { type: 'RELEASE' },
      { type: 'CANCEL' },
    ],
    invariant: (state, before, event) => {
      if (event?.type === 'RELEASE') assert.ok(state.matches('lowered'));
      if (event?.type === 'CANCEL') assert.ok(!state.matches('raised'));
      if (before?.matches('latched') && event?.type !== 'RELEASE')
        assert.ok(state.matches('latched'));
      if (event?.type === 'PRESS' && before?.matches('lowered'))
        assert.equal(state.matches('raised'), event.eligible && !event.repeat);
    },
  }),
  modelCase(cargoMachine, {
    inputs: [undefined],
    abstractContext: ({ context }) => [context.owner],
    events: () => [
      { type: 'CLAIM' as const, actor: 'a' },
      { type: 'CLAIM' as const, actor: 'b' },
      { type: 'CLAIM' as const, actor: '' },
      { type: 'PICKUP' as const, actor: 'a' },
      { type: 'PICKUP' as const, actor: 'b' },
      { type: 'DELIVER' as const, actor: 'a' },
      { type: 'DELIVER' as const, actor: 'b' },
      { type: 'DROP' as const },
      { type: 'RECOVER' as const },
    ],
    invariant: (state, before) => {
      assert.equal(
        state.context.owner !== null,
        state.matches('claimed') || state.matches('carried'),
      );
      if (before?.matches('delivered')) assert.ok(state.matches('delivered'));
      if (before?.matches('recovered')) assert.ok(state.matches('recovered'));
    },
  }),
  modelCase(focusMachine, {
    inputs: [undefined],
    events: () => [{ type: 'DISABLE' as const }],
    invariant: (state, before) => {
      if (before?.matches('disabled')) assert.ok(state.matches('disabled'));
    },
  }),
  modelCase(workMachine, {
    inputs: [undefined],
    // Integer and authored decimal boundaries, with every fixed tick represented.
    // Abstract numerical residue, not elapsed ticks; pure tests cover the larger sweep.
    abstractContext: ({ context }) => [
      context.duration,
      Math.round(context.units),
      context.cycleId !== null,
    ],
    events: ({ context }): EventFromLogic<typeof workMachine>[] => [
      ...[0, -1, NaN, Infinity, Number.MAX_VALUE, 2, 3, 3.7].map((duration) => ({
        type: 'START' as const,
        id: 'cycle',
        duration,
      })),
      ...[
        0,
        -1,
        NaN,
        Infinity,
        Number.MAX_VALUE,
        ...(context.duration > 2 ? [1 / 60, 4] : [1, 2, 3]),
      ].map((dt) => ({
        type: 'TICK' as const,
        dt,
      })),
      { type: 'INTERRUPT', reason: 'Hit' },
      { type: 'BLOCK', reason: 'No access' },
      { type: 'CANCEL' },
      { type: 'SETTLE' },
    ],
    invariant: (state, before, event) => {
      const c = state.context;
      assert.ok(Number.isFinite(c.units) && c.units >= 0 && c.units <= c.duration * 60);
      assert.equal(c.cycleId !== null, state.matches('working') || state.matches('ready'));
      if (state.matches('ready')) assert.equal(c.units, c.duration * 60);
      if (state.matches('working')) assert.ok(c.units < c.duration * 60);
      if (!state.matches('working')) assert.equal(c.compensation, 0);
      if (event?.type === 'TICK' && before && !before.matches('working'))
        assert.deepEqual(state.context, before.context);
      if (
        event?.type === 'TICK' &&
        event.dt === 1 / 60 &&
        before?.matches('working') &&
        before.context.duration > 2
      )
        assert.equal(
          state.matches('ready'),
          Math.round(before.context.units) + 1 >= Math.round(before.context.duration * 60),
        );
    },
  }),
  modelCase(objectiveMachine, {
    inputs: [{ capacity: 2 }],
    // Finite progress partition: empty / partial / full. IDs and step numbers do not
    // affect guards. Credit partitions include invalid, partial, exact and overfill.
    abstractContext: ({ context }) => context.progress,
    events: (): EventFromLogic<typeof objectiveMachine>[] => [
      ...[-1, 0, 0.5, NaN, Infinity, 1, 2, 64, 65].map((amount) => ({
        type: 'CREDIT' as const,
        amount,
      })),
      ...(['completed', 'thwarted', 'lost', 'contested'] as const).map((status) => ({
        type: 'RESOLVE' as const,
        status,
        outcomeId: 'authored-outcome',
        step: 1,
      })),
    ],
    invariant: (state, before, event) => {
      assert.ok(Number.isSafeInteger(state.context.progress));
      assert.ok(state.context.progress >= 0 && state.context.progress <= state.context.capacity);
      assert.equal(state.context.resolution === null, state.matches('unresolved'));
      if (state.matches('completed') || state.matches('contested'))
        assert.equal(state.context.progress, state.context.capacity);
      if (before && !before.matches('unresolved')) {
        assert.deepEqual(state.value, before.value);
        assert.deepEqual(state.context, before.context, 'terminal history is immutable');
      }
      if (before && event?.type === 'CREDIT')
        assert.ok(state.context.progress >= before.context.progress);
    },
  }),
  ...[skeletonMachine, goblinMachine, koboldMachine].map((machine) =>
    modelCase(machine, {
      inputs: [undefined],
      events: () => monsterEvents,
      invariant: (state, before, event) => {
        if (before?.matches('dead') && event?.type !== 'REVIVE') assert.equal(state.value, 'dead');
        if (event?.type === 'THINK' && event.hasTarget && !state.matches('dead'))
          assert.ok(
            !['cards', 'hackysack', 'smoke', 'returning'].includes(String(state.value)),
            'alerted creatures cannot continue a social activity',
          );
        if (
          event?.type === 'THINK' &&
          !event.hasTarget &&
          machine.id !== 'skeleton' &&
          !state.matches('dead')
        )
          assert.equal(
            state.value,
            event.atHome ? event.activity : 'returning',
            'social creatures gather at their home rather than patrol',
          );
      },
    }),
  ),
  modelCase(attackMachine, {
    inputs: [undefined],
    abstractContext: ({ context }) => [context.cooldown > 0, context.swing?.ranged],
    events: (): EventFromLogic<typeof attackMachine>[] => [
      { type: 'START', swing, cooldown: 1 },
      { type: 'START', swing: { ...swing, ranged: true }, cooldown: 1 },
      { type: 'TICK', dt: 0.25 },
      { type: 'TICK', dt: 1 },
      { type: 'TICK', dt: -1 },
      { type: 'COOLDOWN', dt: 1 },
      { type: 'SET_COOLDOWN', value: 0 },
      { type: 'SET_COOLDOWN', value: 1 },
      { type: 'CANCEL' },
      { type: 'INTERRUPT' },
      { type: 'DIE' },
      { type: 'RESET' },
    ],
    invariant: (state, before, event) => {
      const { swing: current, cooldown, impacts } = state.context;
      assert.ok(cooldown >= 0);
      assert.equal(current !== null, state.matches('windup') || state.matches('recovery'));
      if (current) {
        assert.ok(current.elapsed >= 0);
        assert.equal(current.resolved, state.matches('recovery'));
        if (state.matches('windup')) assert.ok(current.elapsed < current.impact);
        if (state.matches('recovery'))
          assert.ok(current.elapsed >= current.impact && current.elapsed < current.duration);
      }
      if (before) {
        const delta = impacts - before.context.impacts;
        assert.ok(
          delta === 0 || delta === 1,
          'one attack can produce at most one impact per event',
        );
        if (delta) assert.ok(event?.type === 'TICK' && before.matches('windup'));
        if (before.matches('dead') && event?.type !== 'RESET') assert.equal(state.value, 'dead');
      }
    },
  }),
  modelCase(commandMachine, {
    inputs: [undefined],
    abstractContext: ({ context }) => context.target,
    events: (): EventFromLogic<typeof commandMachine>[] => [
      { type: 'TARGET', target: 'enemy' },
      { type: 'TARGET', target: null },
      { type: 'DOOR', target: 'door' },
      { type: 'CANCEL' },
      { type: 'RELEASE_DOOR' },
      { type: 'DIE' },
      { type: 'RESET' },
    ],
    invariant: (state, before, event) => {
      assert.equal(
        state.context.target !== null,
        state.matches('pursuing') || state.matches('interacting'),
      );
      if (before?.matches('dead') && event?.type !== 'RESET') assert.equal(state.value, 'dead');
      if (event?.type === 'RELEASE_DOOR' && !before?.matches('interacting'))
        assert.deepEqual(state.context, before?.context);
    },
  }),
  modelCase(healthMachine, {
    inputs: [{ max: 100 }],
    abstractContext: ({ context }) => [context.current, context.max, context.invulnerable > 0],
    events: (): EventFromLogic<typeof healthMachine>[] => [
      { type: 'DAMAGE', amount: 25 },
      { type: 'DAMAGE', amount: 100 },
      { type: 'DAMAGE', amount: -1 },
      { type: 'SET_HP', value: 100 },
      { type: 'SET_HP', value: 0 },
      { type: 'SET_MAX', value: 50 },
      { type: 'PROTECT', value: 1 },
      { type: 'PROTECT', value: 0 },
      { type: 'TICK', dt: 1 },
      { type: 'TICK', dt: -1 },
    ],
    invariant: (state, before, event) => {
      const health = state.context;
      assert.ok(health.current >= 0 && health.current <= health.max && health.invulnerable >= 0);
      assert.equal(state.matches('dead'), health.current === 0);
      if (state.matches('protected')) assert.ok(health.current > 0 && health.invulnerable > 0);
      if (state.matches('alive')) assert.equal(health.invulnerable, 0);
      if (event?.type === 'DAMAGE' && before && !before.matches('alive'))
        assert.equal(health.current, before.context.current);
    },
  }),
  modelCase(locomotionMachine, {
    inputs: [undefined],
    abstractContext: (state) =>
      state.matches('starting')
        ? state.context.phaseTime >= 0.18
        : state.matches('stopping')
          ? state.context.phaseTime >= 0.24
          : null,
    events: () =>
      [false, true].flatMap((moving) =>
        [false, true].flatMap((wantsMovement) =>
          [0, 0.3, -1].map((dt) => ({ type: 'SAMPLE' as const, moving, wantsMovement, dt })),
        ),
      ),
    invariant: (state, before, event) => {
      assert.ok(state.context.phaseTime >= 0);
      if (event && !event.moving && before?.matches('idle'))
        assert.equal(state.value, 'idle', 'blocked travel must not start a walk animation');
      if (event && before && !before.matches('idle') && state.matches('idle'))
        assert.equal(event.moving, false);
    },
  }),
  modelCase(navigationMachine, {
    inputs: [undefined],
    abstractContext: ({ context }) => [
      context.route.length,
      context.next,
      context.opensDoors,
      context.stuckTime > 0,
    ],
    events: (): EventFromLogic<typeof navigationMachine>[] => [
      { type: 'PLAN', route: [] },
      {
        type: 'PLAN',
        route: [
          { x: 1, z: 0 },
          { x: 2, z: 0 },
        ],
      },
      { type: 'CONFIGURE', opensDoors: true },
      { type: 'CONFIGURE', opensDoors: false },
      { type: 'PROBE', clear: true, canOpen: false, next: 0 },
      { type: 'PROBE', clear: true, canOpen: false, next: 1 },
      { type: 'PROBE', clear: true, canOpen: false, next: 2 },
      { type: 'PROBE', clear: true, canOpen: false, next: -1 },
      { type: 'PROBE', clear: false, canOpen: true, next: 0 },
      { type: 'PROBE', clear: false, canOpen: false, next: 0 },
      { type: 'PROGRESS', moved: 0, dt: 0.2 },
      { type: 'PROGRESS', moved: 0, dt: 1 },
      { type: 'PROGRESS', moved: 1, dt: 1 },
      { type: 'CANCEL' },
      { type: 'ARRIVE' },
    ],
    invariant: (state) => {
      const { route, next, stuckTime } = state.context;
      assert.ok(next >= 0 && stuckTime >= 0);
      if (state.matches('waitingForDoor')) assert.ok(state.context.opensDoors);
      if (state.matches('idle')) assert.deepEqual([route.length, next, stuckTime], [0, 0, 0]);
      else
        assert.ok(
          route.length > 0 && next < route.length,
          'active travel requires a valid waypoint',
        );
    },
  }),
  modelCase(doorMachine, {
    inputs: [
      { locked: true, open: false, angle: 0 },
      { locked: false, open: false, angle: 0 },
      { locked: false, open: true, angle: 0 },
    ],
    abstractContext: ({ context }) => [
      context.occupied,
      context.angle <= 0.005 ? 0 : context.angle <= 0.05 ? 1 : context.angle <= 1.2 ? 2 : 3,
    ],
    events: (): EventFromLogic<typeof doorMachine>[] => [
      { type: 'OPEN' },
      { type: 'CLOSE' },
      { type: 'LOCK' },
      { type: 'UNLOCK' },
      ...[false, true].flatMap((occupied) =>
        [0, 0.01, 0.3, 1, -1].map((dt) => ({ type: 'TICK' as const, dt, occupied })),
      ),
    ],
    invariant: (state, before, event) => {
      assert.ok(state.context.angle >= 0 && state.context.angle <= Math.PI * 0.49);
      if (state.matches('closed')) assert.equal(state.context.angle, 0);
      if (state.matches('open')) assert.equal(state.context.angle, Math.PI * 0.49);
      if (before?.matches('locked') && event?.type !== 'UNLOCK')
        assert.equal(state.value, 'locked');
      assert.ok(
        !(state.matches('closing') && state.context.occupied && state.context.angle > 0.05),
      );
    },
  }),
  modelCase(chestMachine, {
    inputs: [
      { open: false, angle: 0 },
      { open: true, angle: 0 },
    ],
    events: (): EventFromLogic<typeof chestMachine>[] => [
      { type: 'OPEN' },
      { type: 'TICK', dt: 0 },
      { type: 'TICK', dt: 2 },
      { type: 'TICK', dt: -1 },
    ],
    invariant: (state, before) => {
      assert.ok(state.context.angle <= 0 && state.context.angle >= -1.5);
      if (state.matches('closed')) assert.equal(state.context.angle, 0);
      if (before && !before.matches('closed'))
        assert.ok(!state.matches('closed'), 'claimed loot cannot return to an unclaimed state');
    },
  }),
  modelCase(progressionMachine, {
    inputs: [undefined],
    events: (): EventFromLogic<typeof progressionMachine>[] => [
      { type: 'KINDLE' },
      { type: 'CLAIM' },
    ],
    invariant: (state, before, event) => {
      if (before?.matches('seekingAltar') && event?.type === 'CLAIM')
        assert.equal(state.value, 'seekingAltar');
      if (before?.matches('complete')) assert.equal(state.value, 'complete');
    },
  }),
  modelCase(inspectionMachine, {
    inputs: [{ duration: 0.5 }, { duration: 0 }],
    abstractContext: ({ context }) => context.session?.elapsed === 0,
    events: (): EventFromLogic<typeof inspectionMachine>[] => [
      { type: 'OPEN', session: inspectionSession },
      { type: 'CLOSE', immediate: false, from: pose },
      { type: 'CLOSE', immediate: true, from: pose },
      { type: 'TICK', dt: 1 },
      { type: 'TICK', dt: -1 },
    ],
    invariant: (state, before, event) => {
      assert.equal(state.context.session === null, state.matches('idle'));
      if (state.context.session) assert.ok(state.context.session.elapsed >= 0);
      if (before?.context.session && state.context.session)
        assert.equal(
          state.context.session.saved,
          before.context.session.saved,
          'inspection never replaces its original return pose',
        );
      if (event?.type === 'CLOSE' && event.immediate) assert.equal(state.value, 'idle');
    },
  }),
  modelCase(sessionMachine, {
    inputs: [undefined],
    events: () =>
      (
        [
          'LOAD',
          'READY',
          'FAIL',
          'TOGGLE_MENU',
          'CLOSE_MENU',
          'INSPECT',
          'CLOSE_INSPECTION',
          'VICTORY',
          'CONTINUE',
          'HIDE',
          'SHOW',
          'TOGGLE_MAP',
        ] as const
      ).map((type) => ({ type })),
    invariant: (state, before, event) => {
      assert.equal(
        (['loading', 'playing', 'menu', 'inspecting', 'victory', 'failed'] as const).filter(
          (mode) => state.matches({ mode }),
        ).length,
        1,
      );
      if (event?.type === 'LOAD') assert.ok(state.matches({ mode: 'loading' }));
      if (before && event && ['HIDE', 'SHOW', 'TOGGLE_MAP'].includes(event.type))
        assert.deepEqual(state.value.mode, before.value.mode);
      if (before?.matches({ mode: 'loading' }) && event?.type !== 'READY' && event?.type !== 'FAIL')
        assert.ok(state.matches({ mode: 'loading' }));
    },
  }),
  modelCase(pointerMachine, {
    inputs: [undefined],
    abstractContext: ({ context }) => context.pointer?.id,
    events: (): EventFromLogic<typeof pointerMachine>[] => [
      { type: 'DOWN', pointer: { id: 1, x: 0, y: 0 } },
      { type: 'DOWN', pointer: { id: 2, x: 10, y: 20 } },
      ...[1, 2].flatMap((id) =>
        [false, true].map((pressed) => ({
          type: 'MOVE' as const,
          pointer: { id, x: 5, y: 7 },
          pressed,
        })),
      ),
      { type: 'UP', id: 1 },
      { type: 'UP', id: 2 },
      { type: 'SELECT_TARGET' },
      { type: 'CANCEL' },
    ],
    invariant: (state, before, event) => {
      assert.equal(state.context.pointer === null, state.matches('idle'));
      if (event?.type === 'MOVE' && event.pointer.id !== before?.context.pointer?.id)
        assert.deepEqual(state.context.pointer, before?.context.pointer);
      if (event?.type === 'MOVE' && event.pressed && before?.matches('target'))
        assert.equal(state.value, 'target');
    },
  }),
  modelCase(inspectorMachine, {
    inputs: [undefined],
    events: ({ context }): EventFromLogic<typeof inspectorMachine>[] => [
      { type: 'TOGGLE' },
      { type: 'CLOSE' },
      { type: 'RESOLVE', request: context.request },
      { type: 'RESOLVE', request: context.request - 1 },
      { type: 'REJECT', request: context.request },
      { type: 'REJECT', request: context.request - 1 },
    ],
    invariant: (state, before, event) => {
      assert.ok(state.context.request >= 0);
      if (before && event && 'request' in event && event.request !== before.context.request)
        assert.equal(state.value, before.value, 'stale imports cannot change inspector state');
    },
  }),
  modelCase(feedbackMachine, {
    inputs: [undefined],
    abstractContext: ({ context }) => context.until,
    events: (): EventFromLogic<typeof feedbackMachine>[] => [
      { type: 'SHOW', now: 0, duration: 100 },
      { type: 'SHOW', now: 80, duration: 200 },
      { type: 'TICK', now: 100 },
      { type: 'TICK', now: 280 },
      { type: 'HIDE' },
    ],
    invariant: (state, before, event) => {
      assert.ok(state.context.until >= 0);
      if (event?.type === 'TICK' && before && event.now >= before.context.until)
        assert.equal(state.value, 'hidden');
    },
  }),
];
