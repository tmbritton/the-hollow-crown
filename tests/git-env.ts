import { execFileSync } from 'node:child_process';

let localVariables: string[] | undefined;

/** Bind Git to the requested cwd, not to a repository or index inherited from a hook. */
export function isolatedGitEnv(): NodeJS.ProcessEnv {
  localVariables ??= execFileSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' })
    .trim()
    .split(/\s+/);
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_OPTIONAL_LOCKS: '0' };
  for (const name of localVariables) delete env[name];
  return env;
}
