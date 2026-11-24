"""Run a single bounded command against a newly owned Vite instance."""

import argparse
import os
from pathlib import Path
import signal
import socket
import subprocess
import time
from urllib.request import urlopen


def stop_group(process):
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        pass
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    process.wait()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['dev', 'preview'])
    parser.add_argument('port', type=int)
    parser.add_argument('root', type=Path)
    parser.add_argument('cwd', type=Path)
    parser.add_argument('base')
    parser.add_argument('seconds', type=int)
    parser.add_argument('command', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', args.port))  # fail closed; never reuse an endpoint
    url = f'http://127.0.0.1:{args.port}{args.base}'
    server_log = Path(os.environ['VITE_LOG'])
    with server_log.open('w+') as log:
        server = subprocess.Popen(
            ['npm', 'run', args.mode, '--', '--host', '127.0.0.1', '--strictPort',
             '--port', str(args.port), '--base', args.base],
            cwd=args.root, stdout=log, stderr=subprocess.STDOUT, start_new_session=True,
        )
        try:
            for _ in range(300):
                if server.poll() is not None:
                    raise RuntimeError(f'Owned Vite exited: {server_log}')
                if url in server_log.read_text():
                    break
                time.sleep(0.1)
            else:
                raise TimeoutError(f'Owned Vite not ready: {server_log}')
            expected = args.root / ('index.html' if args.mode == 'dev' else 'dist/index.html')
            with urlopen(url, timeout=10) as response:
                html = response.read().decode()
                if args.mode == 'dev':
                    assert expected.read_text().split('<title>', 1)[1].split('</title>', 1)[0] in html
                    with urlopen(url + 'src/world.ts?raw', timeout=15) as source:
                        import json
                        served = source.read().decode().split('export default ', 1)[1]
                        assert json.JSONDecoder().raw_decode(served)[0] == (args.root / 'src/world.ts').read_text()
                else:
                    assert html == expected.read_text()
            print(f'Owned {args.mode} pid={server.pid}, cwd={args.root}, url={url}', flush=True)
            env = {**os.environ, 'DEMO_URL': url.rstrip('/') if args.mode == 'dev' else url}
            client = subprocess.Popen(
                [url if arg == '@URL@' else arg for arg in args.command],
                cwd=args.cwd, env=env, start_new_session=True,
            )
            try:
                returncode = client.wait(timeout=args.seconds)
                if server.poll() is not None:
                    raise RuntimeError('Owned Vite stopped during verification')
                return returncode
            finally:
                stop_group(client)
        finally:
            stop_group(server)


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(SystemExit(143)))
    raise SystemExit(main())
