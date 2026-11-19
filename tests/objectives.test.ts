import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ECS } from '../src/ecs.ts';
import { ObjectiveRecord, OBJECTIVE_LIMITS } from '../src/objectives.ts';
import type {
  ObjectivePlan,
  ObjectiveConditions,
  ObjectiveContribution,
  ObjectiveStep,
} from '../src/objectives.ts';

function plan(): ObjectivePlan {
  return {
    objectives: [
      {
        id: 'restore',
        owner: { kind: 'player', id: 'hero' },
        participants: ['hero'],
        capacity: 6,
        announceOnActivation: false,
        dependencies: [],
        outcomes: { completed: 'restoration', thwarted: 'restoration-impossible' },
      },
      {
        id: 'profane',
        owner: { kind: 'actor', id: 'ward-breaker' },
        participants: ['worker', 'survivor'],
        capacity: 6,
        announceOnActivation: true,
        dependencies: ['focus'],
        outcomes: { completed: 'profanation', thwarted: 'profanation-prevented' },
      },
      {
        id: 'tribute',
        owner: { kind: 'group', id: 'scavengers' },
        participants: ['carrier'],
        capacity: 4,
        announceOnActivation: true,
        dependencies: ['exit'],
        outcomes: { completed: 'tribute-lost', thwarted: 'tribute-stopped' },
      },
    ],
    races: [
      {
        id: 'ember',
        playerObjectiveId: 'restore',
        monsterObjectiveId: 'profane',
        outcomes: {
          playerFirst: 'restored',
          monsterFirst: 'corrupted',
          contested: 'fractured',
        },
      },
    ],
  };
}

function ready(objectiveId: string, participantId: string): ObjectiveConditions {
  return {
    objectiveId,
    available: true,
    participants: [{ id: participantId, eligible: true, status: 'working' }],
  };
}
const conditions = () => [
  ready('restore', 'hero'),
  ready('profane', 'worker'),
  ready('tribute', 'carrier'),
];
function contribution(
  objectiveId: string,
  amount: number,
  id = `${objectiveId}:cycle`,
  participantId = objectiveId === 'restore'
    ? 'hero'
    : objectiveId === 'profane'
      ? 'worker'
      : 'carrier',
): ObjectiveContribution {
  return { id, objectiveId, participantId, amount };
}
function start(record: ObjectiveRecord): void {
  record.resolveStep({
    step: 0,
    activate: ['restore', 'profane', 'tribute'],
    conditions: conditions(),
  });
}
function permutations<T>(values: T[]): T[][] {
  if (!values.length) return [[]];
  return values.flatMap((value, i) =>
    permutations(values.filter((_, j) => j !== i)).map((rest) => [value, ...rest]),
  );
}

test('ownership, roster, discovery, activation, prerequisites and current work are independent', () => {
  const record = new ObjectiveRecord(plan());
  record.resolveStep({ step: 0, discover: ['restore'], conditions: conditions() });
  assert.equal(record.get('restore').visible, true);
  assert.equal(record.get('restore').activated, false);
  assert.equal(record.get('restore').available, true);
  assert.equal(record.get('profane').visible, false);
  record.resolveStep({
    step: 1,
    activate: ['profane'],
    conditions: [{ ...ready('profane', 'worker'), available: false, reason: 'Missing rite' }],
    contributions: [contribution('restore', 1), contribution('profane', 1)],
  });
  assert.equal(
    record.get('profane').visible,
    true,
    'active rival is announced despite prerequisites',
  );
  assert.equal(record.get('profane').discovered, false, 'announcement is not discovery');
  assert.equal(record.get('profane').workStatus, 'unavailable');
  assert.equal(record.get('profane').reason, 'Missing rite');
  assert.equal(record.get('profane').progress, 0);
  assert.equal(record.get('restore').progress, 0, 'discovery and readiness do not activate work');
  record.resolveStep({
    step: 2,
    conditions: [ready('profane', 'worker')],
    contributions: [
      contribution('profane', 2, 'owner', 'ward-breaker'),
      contribution('profane', 2, 'hero', 'hero'),
    ],
  });
  assert.equal(
    record.get('profane').progress,
    0,
    'ownership or player identity never grants eligibility',
  );
  record.resolveStep({
    step: 3,
    conditions: [ready('profane', 'survivor')],
    contributions: [contribution('profane', 2, 'takeover', 'survivor')],
  });
  assert.equal(
    record.get('profane').progress,
    2,
    'declared participant can work without owning the plan',
  );
});

test('blocked and interrupted work resumes without losing history or replaying cancelled actions', () => {
  const record = new ObjectiveRecord(plan());
  start(record);
  record.resolveStep({
    step: 1,
    conditions: conditions(),
    contributions: [contribution('profane', 2, 'old')],
  });
  for (const [index, status] of (['blocked', 'interrupted', 'idle'] as const).entries()) {
    const facts = ready('profane', 'worker');
    facts.participants[0].status = status;
    facts.participants[0].reason = status === 'blocked' ? 'Route obstructed' : 'Not working';
    record.resolveStep({
      step: index + 2,
      conditions: [facts],
      contributions: [contribution('profane', 1, status)],
    });
    assert.equal(record.get('profane').workStatus, status);
    assert.equal(record.get('profane').reason, facts.participants[0].reason);
    assert.equal(record.get('profane').participants[0].reason, facts.participants[0].reason);
    assert.equal(record.get('profane').progress, 2);
  }
  record.resolveStep({
    step: 5,
    conditions: conditions(),
    contributions: [contribution('profane', 1, 'blocked'), contribution('profane', 1, 'resumed')],
  });
  assert.equal(record.get('profane').workStatus, 'working');
  assert.equal(record.get('profane').progress, 3);
  assert.deepEqual(
    record.snapshot().contributions.map((entry) => entry.id),
    ['old', 'resumed'],
  );
});

test('contributions require fresh boundary facts and dynamic participant eligibility', () => {
  const record = new ObjectiveRecord(plan());
  start(record);
  record.resolveStep({ step: 1, contributions: [contribution('profane', 1, 'stale')] });
  const facts = ready('profane', 'worker');
  facts.participants[0].eligible = false;
  record.resolveStep({
    step: 2,
    conditions: [facts],
    contributions: [contribution('profane', 1, 'ineligible')],
  });
  assert.equal(record.get('profane').progress, 0);
  record.resolveStep({
    step: 3,
    conditions: conditions(),
    contributions: [contribution('profane', 1, 'new')],
  });
  assert.equal(record.get('profane').progress, 1);
});

test('identical action IDs credit once; conflicting duplicates are rejected independent of order', () => {
  for (const candidates of permutations([
    contribution('restore', 1, 'same'),
    contribution('restore', 2, 'same'),
    contribution('tribute', 1, 'same'),
  ])) {
    const record = new ObjectiveRecord(plan());
    start(record);
    const result = record.resolveStep({
      step: 1,
      conditions: conditions(),
      contributions: candidates,
    });
    assert.deepEqual(result.contributions, [{ id: 'same', status: 'conflict', credited: 0 }]);
    assert.equal(record.get('restore').progress, 0);
    assert.equal(record.get('tribute').progress, 0);
    record.resolveStep({
      step: 2,
      conditions: conditions(),
      contributions: [contribution('restore', 3, 'same')],
    });
    assert.equal(record.get('restore').progress, 0, 'conflicted IDs are retired');
  }
  const record = new ObjectiveRecord(plan());
  start(record);
  const action = contribution('restore', 2, 'once');
  record.resolveStep({ step: 1, conditions: conditions(), contributions: [action, { ...action }] });
  record.resolveStep({
    step: 2,
    conditions: conditions(),
    contributions: [
      { ...action, amount: 6 },
      { ...action, objectiveId: 'tribute', participantId: 'carrier' },
    ],
  });
  assert.equal(record.get('restore').progress, 2);
  assert.equal(record.get('tribute').progress, 0);
  assert.deepEqual(record.snapshot().contributions, [{ ...action, step: 1, credited: 2 }]);
});

test('atomic exclusive race outcomes are invariant under plan, contribution and condition permutations', () => {
  const results = new Set<string>();
  for (const objectives of permutations(plan().objectives)) {
    for (const contributions of permutations([
      contribution('restore', 6),
      contribution('profane', 6),
      contribution('tribute', 1),
    ])) {
      for (const facts of permutations(conditions())) {
        const authored = plan();
        authored.objectives = objectives;
        const record = new ObjectiveRecord(authored);
        start(record);
        record.resolveStep({ step: 1, conditions: facts, contributions });
        results.add(JSON.stringify(record.snapshot()));
        assert.equal(record.get('restore').status, 'contested');
        assert.equal(record.get('profane').status, 'contested');
        assert.equal(record.get('tribute').status, 'unresolved');
        assert.deepEqual(record.snapshot().outcomes, [
          { id: 'fractured', kind: 'contested', step: 1, objectiveIds: ['profane', 'restore'] },
        ]);
      }
    }
  }
  assert.equal(results.size, 1, 'including detached history order, not just the winner');
});

test('player-first and monster-first latch authored outcomes and affect only the declared rival', () => {
  for (const winner of ['restore', 'profane']) {
    const record = new ObjectiveRecord(plan());
    start(record);
    record.resolveStep({
      step: 1,
      conditions: conditions(),
      contributions: [contribution(winner, 6), contribution('tribute', 1)],
    });
    const loser = winner === 'restore' ? 'profane' : 'restore';
    assert.equal(record.get(winner).status, 'completed');
    assert.equal(record.get(loser).status, winner === 'restore' ? 'thwarted' : 'lost');
    assert.equal(record.snapshot().outcomes[0].id, winner === 'restore' ? 'restored' : 'corrupted');
    record.resolveStep({
      step: 2,
      conditions: conditions(),
      contributions: [contribution(loser, 6, 'late'), contribution('tribute', 3, 'delivery')],
    });
    assert.equal(record.get(loser).progress, 0);
    assert.equal(record.get('tribute').status, 'completed');
    assert.equal(record.snapshot().outcomes.length, 2);
    assert.equal(record.snapshot().outcomes[1].id, 'tribute-lost');
  }
});

test('same-step permanent disruption dominates unfinished contribution and preserves committed history', () => {
  for (const reverse of [false, true]) {
    const record = new ObjectiveRecord(plan());
    start(record);
    record.resolveStep({
      step: 1,
      conditions: conditions(),
      contributions: [contribution('profane', 5, 'committed')],
    });
    const candidates = [contribution('restore', 6), contribution('profane', 1, 'unfinished')];
    record.resolveStep({
      step: 2,
      conditions: conditions(),
      contributions: reverse ? candidates.reverse() : candidates,
      disruptions: [{ objectiveId: 'profane', reason: 'Unique executor killed' }],
    });
    assert.equal(record.get('profane').progress, 5);
    assert.equal(record.get('profane').resolution?.outcomeId, 'profanation-prevented');
    assert.equal(record.get('restore').resolution?.outcomeId, 'restored');
    assert.deepEqual(
      record.snapshot().contributions.map((item) => item.id),
      ['committed', 'restore:cycle'],
    );
    assert.ok(!record.snapshot().outcomes.some((item) => item.id === 'fractured'));
  }
});

test('essential dependency invalidation is permanent, explicit, and wins over same-step completion', () => {
  const record = new ObjectiveRecord(plan());
  start(record);
  record.resolveStep({
    step: 1,
    conditions: conditions(),
    contributions: [contribution('profane', 5)],
  });
  record.resolveStep({
    step: 2,
    conditions: conditions(),
    invalidatedDependencies: [{ dependencyId: 'focus', reason: 'Focus destroyed' }],
    contributions: [contribution('profane', 1, 'final'), contribution('tribute', 1)],
  });
  assert.equal(record.get('profane').status, 'thwarted');
  assert.equal(record.get('profane').progress, 5);
  assert.equal(record.get('profane').reason, 'Focus destroyed');
  record.resolveStep({
    step: 3,
    activate: ['profane'],
    conditions: conditions(),
    contributions: [
      contribution('profane', 6, 'retry'),
      contribution('restore', 2),
      contribution('tribute', 1, 'another'),
    ],
  });
  assert.equal(record.get('restore').progress, 2);
  assert.equal(record.get('tribute').progress, 2);
  assert.equal(record.get('profane').progress, 5);
});

test('completed and contested outcomes are terminal and later killing/disabling cannot undo them', () => {
  for (const candidates of [
    [contribution('profane', 6)],
    [contribution('profane', 6), contribution('restore', 6)],
  ]) {
    const record = new ObjectiveRecord(plan());
    start(record);
    record.resolveStep({ step: 1, conditions: conditions(), contributions: candidates });
    const before = record.get('profane');
    const outcomes = record.snapshot().outcomes;
    const result = record.resolveStep({
      step: 2,
      activate: ['profane'],
      conditions: conditions(),
      disruptions: [{ objectiveId: 'profane', reason: 'Killed later' }],
      invalidatedDependencies: [{ dependencyId: 'focus', reason: 'Disabled later' }],
      contributions: [contribution('profane', 6, 'later')],
    });
    assert.deepEqual(record.get('profane'), before);
    assert.deepEqual(record.snapshot().outcomes, outcomes);
    assert.deepEqual(result.outcomes, []);
  }
});

test('unrelated objectives can both complete together and separate race pairs do not interfere', () => {
  const authored = plan();
  authored.races = [];
  const record = new ObjectiveRecord(authored);
  start(record);
  record.resolveStep({
    step: 1,
    conditions: conditions(),
    contributions: [contribution('restore', 6), contribution('profane', 6)],
  });
  assert.equal(record.get('restore').status, 'completed');
  assert.equal(record.get('profane').status, 'completed');
  assert.deepEqual(
    record
      .snapshot()
      .outcomes.map((item) => item.id)
      .sort(),
    ['profanation', 'restoration'],
  );
  const paired = plan();
  paired.objectives.push({
    ...structuredClone(paired.objectives[0]),
    id: 'guard',
    participants: ['guard'],
    outcomes: { completed: 'guarded', thwarted: 'guard-lost' },
  });
  paired.races.push({
    id: 'cache',
    playerObjectiveId: 'guard',
    monsterObjectiveId: 'tribute',
    outcomes: { playerFirst: 'cache-safe', monsterFirst: 'cache-gone', contested: 'cache-split' },
  });
  const other = new ObjectiveRecord(paired);
  other.resolveStep({
    step: 0,
    activate: ['restore', 'profane', 'tribute', 'guard'],
    conditions: [...conditions(), ready('guard', 'guard')],
    contributions: [contribution('restore', 6), contribution('tribute', 4)],
  });
  assert.equal(other.get('profane').status, 'thwarted');
  assert.equal(other.get('guard').status, 'lost');
  assert.deepEqual(
    other.snapshot().outcomes.map((item) => item.id),
    ['cache-gone', 'restored'],
  );
});

test('capacity is saturated deterministically and histories record actual credited segments', () => {
  const results = new Set<string>();
  for (const contributions of permutations([
    contribution('restore', 4, 'a'),
    contribution('restore', 4, 'b'),
  ])) {
    const record = new ObjectiveRecord(plan());
    start(record);
    record.resolveStep({ step: 1, conditions: conditions(), contributions });
    assert.equal(record.get('restore').progress, 6);
    assert.deepEqual(
      record.snapshot().contributions.map((item) => item.credited),
      [4, 2],
    );
    results.add(JSON.stringify(record.snapshot()));
  }
  assert.equal(results.size, 1);
});

test('authored and runtime contracts are detached, ECS-owned, retained across actor replacement', () => {
  const authored = plan();
  const record = new ObjectiveRecord(authored);
  const ecs = new ECS();
  ecs.create('run').add('objectives', record);
  ecs.create('hero');
  authored.objectives[0].participants.length = 0;
  authored.objectives[0].owner.id = 'changed';
  authored.races[0].outcomes.playerFirst = 'changed';
  const facts = conditions();
  const action = contribution('restore', 2);
  record.resolveStep({
    step: 0,
    activate: ['restore'],
    conditions: facts,
    contributions: [action],
  });
  facts[0].participants[0].eligible = false;
  action.amount = 6;
  const view = record.snapshot();
  view.objectives[0].owner.id = 'changed';
  view.objectives[0].participants.length = 0;
  view.contributions[0].credited = 6;
  ecs.remove('hero');
  ecs.create('hero');
  assert.equal(ecs.query('objectives')[0].require('objectives'), record);
  assert.equal(record.get('restore').progress, 2);
  assert.equal(record.get('restore').owner.id, 'hero');
  assert.equal(record.get('restore').participants[0].eligible, true);
  assert.equal(record.snapshot().contributions[0].credited, 2);
  record.resolveStep({
    step: 1,
    conditions: conditions(),
    contributions: [contribution('restore', 4, 'finish')],
  });
  const receipt = record.resolveStep({ step: 2 });
  receipt.outcomes.push({ id: 'fake', kind: 'completed', step: 2, objectiveIds: ['restore'] });
  const terminal = record.get('restore');
  terminal.resolution!.outcomeId = 'changed';
  assert.equal(record.get('restore').resolution?.outcomeId, 'restored');
  const replacement = new ECS();
  replacement.create('run').add('objectives', new ObjectiveRecord(plan()));
  assert.equal(replacement.get('run')!.require('objectives').get('restore').progress, 0);
});

test('invalid plans reject ambiguous identities, relationships, rosters and capacities', () => {
  const invalid: ((value: ObjectivePlan) => void)[] = [
    (value) => {
      value.objectives[0].id = '';
    },
    (value) => {
      value.objectives[1].announceOnActivation = false;
    },
    (value) => {
      value.objectives[1].id = 'restore';
    },
    (value) => {
      value.objectives[0].participants = ['hero', 'hero'];
    },
    (value) => {
      value.objectives[0].participants = [];
    },
    (value) => {
      value.objectives[0].dependencies = ['focus', 'focus'];
    },
    (value) => {
      value.objectives[0].outcomes.completed = 'fractured';
    },
    (value) => {
      value.races[0].monsterObjectiveId = 'missing';
    },
    (value) => {
      value.races[0].monsterObjectiveId = 'restore';
    },
    (value) => {
      value.races.push(structuredClone(value.races[0]));
    },
    (value) => {
      value.races.push({
        ...structuredClone(value.races[0]),
        id: 'other',
        outcomes: { playerFirst: 'a', monsterFirst: 'b', contested: 'c' },
      });
    },
    ...[0, -1, 1.5, NaN, Infinity, OBJECTIVE_LIMITS.capacity + 1].map(
      (capacity) => (value: ObjectivePlan) => {
        value.objectives[0].capacity = capacity;
      },
    ),
  ];
  for (const mutate of invalid) {
    const authored = plan();
    mutate(authored);
    assert.throws(() => new ObjectiveRecord(authored));
  }
  assert.doesNotThrow(() => new ObjectiveRecord({ objectives: [], races: [] }));
});

test('simultaneous disruption reasons, dependency invalidations and group readiness are order independent', () => {
  const results = new Set<string>();
  for (const disruptions of permutations([
    { objectiveId: 'restore', reason: 'Rite destroyed' },
    { objectiveId: 'restore', reason: 'Altar destroyed' },
  ])) {
    for (const invalidatedDependencies of permutations([
      { dependencyId: 'focus', reason: 'Focus disabled' },
      { dependencyId: 'focus', reason: 'Focus destroyed' },
    ])) {
      for (const participants of permutations([
        { id: 'worker', eligible: false, status: 'interrupted' as const, reason: 'Dead' },
        { id: 'survivor', eligible: true, status: 'working' as const },
      ])) {
        const record = new ObjectiveRecord(plan());
        start(record);
        record.resolveStep({
          step: 1,
          conditions: [{ objectiveId: 'profane', available: true, participants }],
          contributions: [contribution('profane', 2, 'survivor:cycle', 'survivor')],
        });
        assert.equal(record.get('profane').workStatus, 'working');
        assert.equal(record.get('profane').progress, 2);
        record.resolveStep({
          step: 2,
          conditions: conditions(),
          disruptions,
          invalidatedDependencies,
          contributions: [
            contribution('restore', 6),
            contribution('profane', 6),
            contribution('tribute', 4),
          ],
        });
        assert.equal(record.get('restore').status, 'thwarted');
        assert.equal(record.get('profane').status, 'thwarted');
        assert.equal(record.get('tribute').status, 'completed');
        assert.equal(record.snapshot().outcomes.length, 3, 'no fabricated race winner');
        results.add(JSON.stringify(record.snapshot()));
      }
    }
  }
  assert.equal(results.size, 1);
});

test('plan, batch and lifetime deduplication bounds reject overflow without partial commits', () => {
  for (const count of [OBJECTIVE_LIMITS.objectives, OBJECTIVE_LIMITS.objectives + 1]) {
    const authored = plan();
    authored.races = [];
    authored.objectives = Array.from({ length: count }, (_, i) => ({
      ...structuredClone(authored.objectives[0]),
      id: `objective:${i}`,
      capacity: OBJECTIVE_LIMITS.capacity,
      outcomes: { completed: `complete:${i}`, thwarted: `thwarted:${i}` },
    }));
    if (count === OBJECTIVE_LIMITS.objectives)
      assert.doesNotThrow(() => new ObjectiveRecord(authored));
    else assert.throws(() => new ObjectiveRecord(authored));
  }
  const authored = plan();
  authored.objectives[0].participants = Array.from(
    { length: OBJECTIVE_LIMITS.participants + 1 },
    (_, i) => `participant:${i}`,
  );
  assert.throws(() => new ObjectiveRecord(authored));
  const record = new ObjectiveRecord(plan());
  const candidates = Array.from({ length: OBJECTIVE_LIMITS.contributionsPerStep + 1 }, (_, i) =>
    contribution('restore', 1, `action:${i}`),
  );
  const before = record.snapshot();
  assert.throws(() =>
    record.resolveStep({ step: 0, discover: ['restore'], contributions: candidates }),
  );
  assert.deepEqual(record.snapshot(), before);
  let step = 0;
  for (
    let i = 0;
    i < OBJECTIVE_LIMITS.contributionIds;
    i += OBJECTIVE_LIMITS.contributionsPerStep
  ) {
    record.resolveStep({
      step: step++,
      contributions: Array.from({ length: OBJECTIVE_LIMITS.contributionsPerStep }, (_, j) =>
        contribution('restore', 1, `action:${i + j}`),
      ),
    });
  }
  const full = record.snapshot();
  assert.throws(() =>
    record.resolveStep({
      step,
      discover: ['restore'],
      contributions: [contribution('restore', 1, 'overflow')],
    }),
  );
  assert.deepEqual(record.snapshot(), full);
  const replay = record.resolveStep({
    step,
    contributions: [contribution('restore', 1, 'action:0')],
  });
  assert.deepEqual(replay.contributions, [{ id: 'action:0', status: 'duplicate', credited: 0 }]);
});

test('nonempty receipts and terminal/dependency snapshots cannot rewrite authored outcomes', () => {
  const record = new ObjectiveRecord(plan());
  start(record);
  const receipt = record.resolveStep({
    step: 1,
    conditions: conditions(),
    invalidatedDependencies: [{ dependencyId: 'focus', reason: 'Disabled' }],
    contributions: [contribution('restore', 6)],
  });
  const expected = record.snapshot();
  receipt.outcomes[0].id = 'changed';
  receipt.outcomes[0].objectiveIds.length = 0;
  receipt.contributions[0].credited = 99;
  const detached = record.snapshot();
  detached.outcomes[0].objectiveIds.length = 0;
  detached.invalidatedDependencies[0].reason = 'Changed';
  detached.objectives.find((entry) => entry.id === 'restore')!.resolution!.step = 99;
  assert.deepEqual(record.snapshot(), expected);
});

test('structurally enriched contribution metadata cannot retain caller-owned history references', () => {
  const record = new ObjectiveRecord(plan());
  start(record);
  const action = { ...contribution('restore', 2), work: { cycle: 1 } };
  record.resolveStep({ step: 1, conditions: conditions(), contributions: [action] });
  const before = record.snapshot();
  action.work.cycle = 99;
  action.amount = 6;
  action.id = 'changed';
  assert.deepEqual(record.snapshot(), before, 'caller metadata cannot rewrite committed history');
  assert.deepEqual(before.contributions, [{ ...contribution('restore', 2), step: 1, credited: 2 }]);
});

test('structurally enriched contribution callbacks never enter or poison history snapshots', () => {
  const record = new ObjectiveRecord(plan());
  start(record);
  const action = {
    ...contribution('restore', 6),
    work: { cycle: 1 },
    onCommit() {
      assert.fail('the domain must not call adapter callbacks');
    },
  };
  const receipt = record.resolveStep({
    step: 1,
    conditions: conditions(),
    contributions: [action],
  });
  assert.equal(receipt.outcomes[0].id, 'restored');
  assert.deepEqual(record.snapshot().contributions, [
    { ...contribution('restore', 6), step: 1, credited: 6 },
  ]);
});

// Ordinary structural extensions, with no casts, untyped data or hostile accessors.
function withAdapterMetadata<T extends object>(value: T) {
  return {
    ...value,
    work: { cycle: 1 },
    onCancel() {
      assert.fail('the domain must not call adapter callbacks');
    },
  };
}

test('enriched steps project conditions, participants, disruptions and dependencies before commit', () => {
  const plain: ObjectiveStep = {
    step: 0,
    discover: ['restore'],
    activate: ['restore', 'profane', 'tribute'],
    conditions: conditions(),
    disruptions: [{ objectiveId: 'profane', reason: 'Worker eliminated' }],
    invalidatedDependencies: [{ dependencyId: 'exit', reason: 'Exit sealed' }],
    contributions: [contribution('restore', 2)],
  };
  const enriched = withAdapterMetadata({
    ...plain,
    conditions: conditions().map((facts) =>
      withAdapterMetadata({
        ...facts,
        participants: facts.participants.map(withAdapterMetadata),
      }),
    ),
    disruptions: plain.disruptions!.map(withAdapterMetadata),
    invalidatedDependencies: plain.invalidatedDependencies!.map(withAdapterMetadata),
    contributions: plain.contributions!.map(withAdapterMetadata),
  });
  const control = new ObjectiveRecord(plan());
  const expectedReceipt = control.resolveStep(plain);
  const record = new ObjectiveRecord(plan());
  assert.deepEqual(record.resolveStep(enriched), expectedReceipt);
  assert.deepEqual(
    record.snapshot(),
    control.snapshot(),
    'only declared contract fields are retained',
  );
  enriched.conditions[0].available = false;
  enriched.conditions[0].participants[0].eligible = false;
  enriched.conditions[0].participants[0].work.cycle = 99;
  enriched.conditions[0].participants.length = 0;
  enriched.conditions.length = 0;
  enriched.disruptions[0].reason = 'Changed';
  enriched.invalidatedDependencies[0].reason = 'Changed';
  enriched.contributions[0].work.cycle = 99;
  enriched.work.cycle = 99;
  enriched.discover!.length = 0;
  enriched.activate!.length = 0;
  assert.deepEqual(record.snapshot(), control.snapshot());
});

test('enriched authored plans project nested owners and outcomes without importing adapter metadata', () => {
  const plain = plan();
  const enriched = withAdapterMetadata({
    objectives: plain.objectives.map((definition) =>
      withAdapterMetadata({
        ...definition,
        owner: withAdapterMetadata(definition.owner),
        outcomes: withAdapterMetadata(definition.outcomes),
      }),
    ),
    races: plain.races.map((race) =>
      withAdapterMetadata({
        ...race,
        outcomes: withAdapterMetadata(race.outcomes),
      }),
    ),
  });
  const record = new ObjectiveRecord(enriched);
  const control = new ObjectiveRecord(plain);
  enriched.objectives[0].owner.id = 'changed';
  enriched.objectives[0].owner.work.cycle = 99;
  enriched.objectives[0].participants.length = 0;
  enriched.objectives[1].dependencies.length = 0;
  enriched.races[0].outcomes.playerFirst = 'changed';
  enriched.races.length = 0;
  const batch = {
    step: 0,
    activate: ['restore'],
    conditions: conditions(),
    contributions: [contribution('restore', 6)],
  };
  assert.deepEqual(record.resolveStep(batch), control.resolveStep(batch));
  assert.deepEqual(record.snapshot(), control.snapshot());
});

test('rejected enriched conditions leave the entire record untouched and allow a corrected same-step retry', () => {
  for (const invalidField of ['condition', 'participant'] as const) {
    const record = new ObjectiveRecord(plan());
    const before = record.snapshot();
    const facts = withAdapterMetadata({
      ...ready('restore', 'hero'),
      reason: invalidField === 'condition' ? ' ' : 'Ready',
      participants: [
        withAdapterMetadata({
          id: 'hero',
          eligible: true,
          status: 'working' as const,
          reason: invalidField === 'participant' ? ' ' : 'Ready',
        }),
      ],
    });
    const batch = withAdapterMetadata({
      step: 0,
      discover: ['restore'],
      activate: ['restore'],
      conditions: [facts],
      contributions: [withAdapterMetadata(contribution('restore', 6))],
      disruptions: [withAdapterMetadata({ objectiveId: 'tribute', reason: 'Carrier eliminated' })],
      invalidatedDependencies: [
        withAdapterMetadata({ dependencyId: 'focus', reason: 'Focus disabled' }),
      ],
    });
    assert.throws(() => record.resolveStep(batch));
    assert.deepEqual(
      record.snapshot(),
      before,
      'failure must not advance the step or grant discovery/activation',
    );
    facts.reason = 'Ready';
    facts.participants[0].reason = 'Ready';
    const receipt = record.resolveStep(batch);
    assert.deepEqual(receipt.contributions, [
      { id: 'restore:cycle', status: 'accepted', credited: 6 },
    ]);
    assert.equal(record.get('restore').resolution?.outcomeId, 'restored');
    assert.equal(
      record.snapshot().outcomes.length,
      3,
      'rejection consumed neither actions nor outcomes',
    );
  }
});

test('invalid batches fail transactionally and a step cannot be split into order-dependent races', () => {
  const record = new ObjectiveRecord(plan());
  start(record);
  const before = record.snapshot();
  const invalid: ObjectiveStep[] = [
    { step: 0 },
    { step: -1 },
    { step: 0.5 },
    { step: NaN },
    { step: 1, activate: ['missing'] },
    { step: 1, conditions: [ready('profane', 'intruder')] },
    { step: 1, conditions: [ready('profane', 'worker'), ready('profane', 'survivor')] },
    { step: 1, invalidatedDependencies: [{ dependencyId: 'missing', reason: 'Broken' }] },
    { step: 1, disruptions: [{ objectiveId: 'missing', reason: 'Dead' }] },
    ...[0, -1, NaN, Infinity, 0.5, OBJECTIVE_LIMITS.capacity + 1].map((amount) => ({
      step: 1,
      contributions: [contribution('restore', amount)],
    })),
  ];
  for (const batch of invalid) {
    assert.throws(() => record.resolveStep({ ...batch, discover: ['restore'] }));
    assert.deepEqual(
      record.snapshot(),
      before,
      'no discovery/progress/history leaks from rejection',
    );
  }
  record.resolveStep({
    step: 1,
    conditions: conditions(),
    contributions: [contribution('restore', 6)],
  });
  assert.throws(() =>
    record.resolveStep({
      step: 1,
      conditions: conditions(),
      contributions: [contribution('profane', 6)],
    }),
  );
});
