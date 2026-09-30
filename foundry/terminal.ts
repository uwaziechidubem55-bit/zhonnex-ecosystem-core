/** SSH transport for an authenticated project's private OCI VM; not a public terminal endpoint. */
import { createHash } from 'node:crypto';
import { Client, ClientChannel } from 'ssh2';

export type TerminalGrant = {
  projectId: string; actorId: string; privateIp: string; sshPrivateKey: string;
  hostKeySha256: string; expiresAt: number; allowTerminal: true;
};
export type TerminalSession = { send(text: string): void; resize(cols: number, rows: number): void; close(): void };
function privateIp(ip: string): boolean {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) return false;
  const parts = ip.split('.').map(Number);
  if (parts.some(x => x > 255)) return false;
  return parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168);
}
/** A trusted server MUST construct grant after checking user, project ownership, VM ID and host key in DB.
 * Never deserialize grant directly from a browser. Enforce per-user rate/concurrency limits in the API. */
export async function openTerminal(grant: TerminalGrant, output: (chunk: string) => void): Promise<TerminalSession> {
  if (!grant || grant.allowTerminal !== true || !privateIp(grant.privateIp) ||
      !/^[a-f0-9-]{36}$/.test(grant.projectId) || !grant.actorId ||
      !/^[a-f0-9]{64}$/.test(grant.hostKeySha256) || grant.expiresAt <= Date.now() ||
      grant.expiresAt > Date.now() + 15 * 60_000 || typeof grant.sshPrivateKey !== 'string') {
    throw new Error('FOUNDRY_TERMINAL_DENIED');
  }
  return new Promise((resolve, reject) => {
    const client = new Client(); let settled = false; let channel: ClientChannel | undefined;
    const timer = setTimeout(() => { client.end(); if (!settled) { settled = true; reject(new Error('FOUNDRY_TERMINAL_TIMEOUT')); } }, 15_000);
    client.on('ready', () => {
      client.shell({ term: 'xterm-256color', cols: 100, rows: 30 }, (error, stream) => {
        clearTimeout(timer);
        if (error || !stream) { client.end(); if (!settled) { settled = true; reject(error || new Error('FOUNDRY_TERMINAL_FAILED')); } return; }
        channel = stream;
        stream.on('data', (buf: Buffer) => output(buf.toString('utf8')));
        stream.stderr.on('data', (buf: Buffer) => output(buf.toString('utf8')));
        stream.on('close', () => client.end());
        settled = true;
        resolve({
          send(input: string) {
            if (!channel || channel.destroyed || Date.now() >= grant.expiresAt || input.length > 4096) { client.end(); throw new Error('FOUNDRY_TERMINAL_EXPIRED'); }
            channel.write(input);
          },
          resize(cols: number, rows: number) {
            if (!channel || !Number.isInteger(cols) || !Number.isInteger(rows) || cols < 20 || cols > 240 || rows < 10 || rows > 100) throw new Error('FOUNDRY_BAD_TERMINAL_SIZE');
            channel.setWindow(rows, cols, 0, 0);
          },
          close() { client.end(); }
        });
      });
    });
    client.on('error', error => { clearTimeout(timer); if (!settled) { settled = true; reject(error); } });
    try {
      client.connect({ host: grant.privateIp, port: 22, username: 'ubuntu', privateKey: grant.sshPrivateKey,
        readyTimeout: 12000, keepaliveInterval: 10000, hostVerifier: (key: Buffer) =>
          createHash('sha256').update(key).digest('hex') === grant.hostKeySha256 });
    } catch (error) { clearTimeout(timer); if (!settled) { settled = true; reject(error); } }
  });
}