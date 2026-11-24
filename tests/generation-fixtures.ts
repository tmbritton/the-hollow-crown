import { GenerationError } from '../src/generation/identity.ts';
import { createGenerationReport } from '../src/generation/report.ts';
import { generateDungeonWithReport } from '../src/world.ts';

import { sha, type FixtureInput } from './ef0-contract.ts';

export function observe(input: FixtureInput) {
  try {
    const { world, report } = generateDungeonWithReport(
      input.defaultSeed ? undefined : input.seed,
      input.options,
    );
    return { world, trace: report, report: createGenerationReport(world, report) };
  } catch (error) {
    if (!(error instanceof GenerationError)) throw error;
    return { error: { name: error.name, message: error.message, report: error.report } };
  }
}

export function canonical(value: unknown): string {
  const seen = new Map<object, number>();
  function encode(value: unknown): unknown {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number')
      return Object.is(value, -0)
        ? ['number', '-0']
        : Number.isFinite(value)
          ? value
          : ['number', String(value)];
    if (value === undefined) return ['undefined'];
    if (typeof value !== 'object') throw new TypeError(`Unsupported fixture type: ${typeof value}`);
    const prior = seen.get(value);
    if (prior !== undefined) return ['ref', prior];
    seen.set(value, seen.size);
    if (Array.isArray(value))
      return [
        'array',
        Array.from({ length: value.length }, (_, i) =>
          Object.hasOwn(value, i) ? encode(value[i]) : ['hole'],
        ),
      ];
    if (value instanceof Map) return ['map', [...value].map(([k, v]) => [encode(k), encode(v)])];
    if (value instanceof Set) return ['set', [...value].map(encode)];
    const proto = Object.getPrototypeOf(value);
    if (
      (proto !== Object.prototype && proto !== null) ||
      Object.getOwnPropertySymbols(value).length
    )
      throw new TypeError('Unsupported fixture object');
    return [
      proto === null ? 'dictionary' : 'object',
      Object.getOwnPropertyNames(value)
        .sort()
        .map((key) => {
          const descriptor = Object.getOwnPropertyDescriptor(value, key);
          if (!descriptor || !('value' in descriptor))
            throw new TypeError('Unsupported fixture accessor');
          return [key, encode(descriptor.value)];
        }),
    ];
  }
  return JSON.stringify(encode(value));
}

export function firstDifference(a: unknown, b: unknown, path = '$'): string | undefined {
  if (Object.is(a, b)) return;
  if (!Array.isArray(a) || !Array.isArray(b)) return path;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const difference = firstDifference(a[i], b[i], `${path}[${i}]`);
    if (difference) return difference;
  }
}

export const observeDigest = (input: FixtureInput) => ({
  input,
  sha256: sha(canonical(observe(input))),
});
