import assert from 'node:assert/strict';
import { createActor, getInitialMicrosteps } from 'xstate';
import type {
  AnyStateMachine,
  AnyMachineSnapshot,
  AnyTransitionDefinition,
  EventFromLogic,
  InputFrom,
  SnapshotFrom,
} from 'xstate';
import { createTestModel, getStateNodes } from 'xstate/graph';
import { Statechart } from '../../src/machines/statechart.ts';

type InputArgs<T extends AnyStateMachine> =
  undefined extends InputFrom<T> ? [input?: InputFrom<T>] : [input: InputFrom<T>];

export interface CoverageReport {
  machine: string;
  inputs: number;
  vertices: number;
  graphEdges: number;
  generatedPaths: number;
  cyclicSteps: number;
  states: string[];
  declaredStates: number;
  transitions: number;
  declaredTransitions: number;
}
export interface ModelCase {
  id: string;
  run(): CoverageReport;
}

/** Finite event partitions explore each guard boundary. Serializers remove only
 * unbounded history/presentation data; each replay still validates real context.
 * Shortest paths + every outgoing edge include self-loops and ignored events.
 * Seeded walks add longer cycles without enumerating infinitely many paths. */
export function modelCase<T extends AnyStateMachine>(
  machine: T,
  options: {
    inputs: InputFrom<T>[];
    events: (snapshot: SnapshotFrom<T>) => EventFromLogic<T>[];
    abstractContext?: (snapshot: SnapshotFrom<T>) => unknown;
    invariant: (
      snapshot: SnapshotFrom<T>,
      previous?: SnapshotFrom<T>,
      event?: EventFromLogic<T>,
    ) => void;
  },
): ModelCase {
  return {
    id: machine.id,
    run() {
      const nodes = [...new Set([machine.root, ...getStateNodes(machine)])];
      const expectedStates = nodes.filter(
        (node) => node.type === 'atomic' || node.type === 'final',
      );
      const expectedTransitions = new Set<AnyTransitionDefinition>(
        nodes.flatMap((node) => [...[...node.transitions.values()].flat(), ...(node.always ?? [])]),
      );
      const states = new Set<string>();
      const stateOf = (snapshot: SnapshotFrom<T>) => snapshot as AnyMachineSnapshot;
      const transitions = new Set<AnyTransitionDefinition>();
      const report: CoverageReport = {
        machine: machine.id,
        inputs: options.inputs.length,
        vertices: 0,
        graphEdges: 0,
        generatedPaths: 0,
        cyclicSteps: 0,
        states: [],
        declaredStates: expectedStates.length,
        transitions: 0,
        declaredTransitions: expectedTransitions.size,
      };
      const recordState = (snapshot: SnapshotFrom<T>) => {
        for (const node of expectedStates)
          if (stateOf(snapshot).matches(node.path.join('.'))) states.add(node.id);
      };
      const serializeState = (snapshot: SnapshotFrom<T>) =>
        JSON.stringify([stateOf(snapshot).value, options.abstractContext?.(snapshot)]);

      for (const input of options.inputs) {
        const args = [input] as InputArgs<T>;
        for (const [snapshot] of getInitialMicrosteps(machine, ...args)) recordState(snapshot);
        const model = createTestModel(machine, {
          input,
          events: options.events,
          serializeState,
          serializeTransition: () => '',
          limit: 10000,
        });
        const graph = model.getAdjacencyMap();
        report.vertices += Object.keys(graph).length;
        report.graphEdges += Object.values(graph).reduce(
          (sum, node) => sum + Object.keys(node.transitions).length,
          0,
        );
        const paths = model.getShortestPaths({ allowDuplicatePaths: true });
        assert.equal(
          new Set(paths.map((path) => serializeState(path.state))).size,
          Object.keys(graph).length,
          `${machine.id}: each graph vertex needs a generated path`,
        );

        const replay = (events: EventFromLogic<T>[], walkSeed?: number) => {
          const trace: EventFromLogic<T>[] = [];
          const runtime = new Statechart(machine, ...args);
          const actor = createActor(machine, {
            input,
            inspect: (inspection) => {
              if (inspection.type !== '@xstate.microstep') return;
              for (const transition of inspection._transitions) transitions.add(transition);
              recordState(inspection.snapshot as SnapshotFrom<T>);
            },
          });
          try {
            actor.start();
            recordState(runtime.snapshot);
            options.invariant(runtime.snapshot);
            const step = (event: EventFromLogic<T>) => {
              trace.push(event);
              const previous = runtime.snapshot;
              runtime.send(event);
              actor.send(event);
              recordState(runtime.snapshot);
              assert.deepEqual(stateOf(runtime.snapshot).value, stateOf(actor.getSnapshot()).value);
              assert.deepEqual(
                stateOf(runtime.snapshot).context,
                stateOf(actor.getSnapshot()).context,
              );
              options.invariant(runtime.snapshot, previous, event);
            };
            for (const event of events) step(event);
            if (walkSeed !== undefined) {
              let random = walkSeed;
              for (let i = 0; i < 40; i++) {
                random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
                const candidates = options.events(runtime.snapshot);
                step(candidates[random % candidates.length]);
                report.cyclicSteps++;
              }
            }
            return runtime.snapshot;
          } catch (cause) {
            throw new Error(
              `${machine.id}: invariant failed on generated trace ${JSON.stringify(trace)}`,
              { cause },
            );
          } finally {
            actor.stop();
          }
        };

        for (const path of paths) {
          const events = path.steps
            .filter((step) => step.event.type !== 'xstate.init')
            .map((step) => step.event);
          const reached = replay(events);
          report.generatedPaths++;
          assert.equal(
            serializeState(reached),
            serializeState(path.state),
            `${machine.id}: generated destination must be reachable`,
          );
          // Extend each generated path over every edge, including forbidden attempts.
          for (const event of options.events(reached)) {
            replay([...events, event]);
            report.generatedPaths++;
          }
        }
        for (let seed = 1; seed <= 12; seed++) replay([], seed);
      }
      const unreachable = expectedStates
        .filter((node) => !states.has(node.id))
        .map((node) => node.id);
      const uncovered = [...expectedTransitions]
        .filter((transition) => !transitions.has(transition))
        .map((transition) => ({
          source: transition.source.id,
          event: transition.eventType || '(always)',
          targets: transition.target?.map((node) => node.id) ?? [],
          guard:
            typeof transition.guard === 'function' ? transition.guard.toString() : transition.guard,
        }));
      assert.deepEqual(unreachable, [], `${machine.id}: unreachable declared states`);
      assert.deepEqual(uncovered, [], `${machine.id}: uncovered declared transition branches`);
      report.states = [...states].sort();
      report.transitions = transitions.size;
      return report;
    },
  };
}
