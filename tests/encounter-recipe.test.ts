import assert from 'node:assert/strict';
import { test } from 'node:test';
import { witness, transition, evidenceIssues, recipe } from '../src/encounterRecipe.ts';
import type { Fact, Phase } from '../src/encounterRecipe.ts';

const encounter = ['approach', 'alerted', 'travelling', 'ranked', 'open', 'resolved'] as const;
const facts = (phases: readonly Phase[]): Fact[] =>
  phases.map((phase, i) => ({ phase, tick: i, callback: Math.floor(i / 2) }));

test('ordered milestones in the same callback are retained, and opening is not impact', () => {
  assert.equal(witness('full', facts(encounter)).phase, 'resolved');
  assert.equal(witness('full', facts(encounter.slice(0, -1))).phase, 'open');
  assert.equal(witness('full', facts(['approach', 'open'])).phase, 'invalid');
});

test('label-only milestones are not physical witnesses, and zero ticks cannot execute events', () => {
  const labels = facts(encounter);
  assert.ok(evidenceIssues('full', labels, []).length);
  assert.ok(evidenceIssues('door', facts(['approach', 'opening', 'crossed']), []).length);
  const t = recipe.warmup;
  const door = [
    { phase: 'approach', tick: t, callback: 0 },
    {
      phase: 'opening',
      tick: t + 1,
      callback: 1,
      evidence: { id: recipe.door.id, angle: 0.1, open: true },
    },
    {
      phase: 'crossed',
      tick: t + 2,
      callback: 2,
      evidence: {
        id: recipe.door.id,
        open: true,
        collision: false,
        from: { x: recipe.door.x, z: recipe.door.z - 0.01 * recipe.door.direction },
        to: { x: recipe.door.x, z: recipe.door.z + 0.02 * recipe.door.direction },
        unawareTicks: t + 2,
      },
    },
  ] satisfies Fact[];
  const frames = [t, t, t + 1].map((from, i) => ({
    entry: i,
    work: 0,
    from,
    to: i ? from + 1 : from,
    phases: [door[i]!.phase],
  }));
  assert.deepEqual(evidenceIssues('door', door, frames), []);
  assert.ok(
    evidenceIssues(
      'door',
      door,
      frames.map((f) => ({ ...f, from: f.to })),
    ).length,
  );
  assert.ok(
    evidenceIssues(
      'door',
      [door[0]!, door[1]!, { ...door[2]!, evidence: { ...door[2]!.evidence, collision: true } }],
      frames,
    ).length,
  );
});

test('travelling must close the assigned alert slot, not an invented point ahead', () => {
  const t = recipe.warmup;
  const p = { x: 0, z: 0 },
    assigned = { x: -2, z: 0 };
  const slots = recipe.members.map((id, i) => ({ id, position: p, slot: { x: assigned.x, z: i } }));
  const result = [
    { phase: 'approach', tick: t, callback: 0 },
    {
      phase: 'alerted',
      tick: t + 1,
      callback: 0,
      evidence: { pack: recipe.pack, members: recipe.members, target: 'player', positions: slots },
    },
    {
      phase: 'travelling',
      tick: t + 2,
      callback: 0,
      evidence: { id: recipe.members[0], from: p, to: { x: 1, z: 0 }, slot: { x: 2, z: 0 } },
    },
  ] satisfies Fact[];
  const callback = [{ entry: 0, work: 1, from: t, to: t + 2, phases: result.map((f) => f.phase) }];
  assert.ok(evidenceIssues('full', result, callback).some((s) => s.includes('travelling')));
});

test('door alert is sticky even if it clears and a crossing follows', () => {
  assert.equal(witness('door', facts(['approach', 'opening', 'crossed'])).phase, 'crossed');
  assert.equal(
    witness('door', facts(['approach', 'opening', 'alerted', 'crossed'])).phase,
    'invalid',
  );
});

test('unexpected transitions are explicit and terminal witnesses reject new evidence', () => {
  for (const [i, phase] of encounter.entries()) {
    const state = i ? witness('full', facts(encounter.slice(0, i))) : { phase: 'setup' as const };
    const fact = { phase, tick: i, callback: i };
    assert.equal(transition('full', state, fact).phase, phase);
    assert.equal(transition('full', state, { ...fact, phase: 'crossed' }).phase, 'invalid');
    assert.equal(
      transition('full', state, { ...fact, phase: 'invalid', reason: 'reset' }).phase,
      'invalid',
    );
  }
  assert.equal(
    transition('full', witness('full', facts(encounter)), facts(['approach'])[0]!).phase,
    'invalid',
  );
});
