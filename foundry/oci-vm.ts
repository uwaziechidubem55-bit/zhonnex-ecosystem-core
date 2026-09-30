/** OCI CLI adapter: one private Compute VM per approved project. Server-only. */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const idPattern = /^ocid1\.[a-z0-9_.-]{10,250}$/;
function ocid(name: string): string {
  const value = process.env[name];
  if (!value || !idPattern.test(value)) throw new Error(`${name}_REQUIRED`);
  return value;
}
function config() {
  const shape = process.env.FOUNDRY_OCI_SHAPE;
  const availabilityDomain = process.env.FOUNDRY_OCI_AD;
  if (!shape || !/^[a-zA-Z0-9.]{3,80}$/.test(shape) || !availabilityDomain || availabilityDomain.length > 150) {
    throw new Error('FOUNDRY_OCI_CONFIG_REQUIRED');
  }
  return { shape, availabilityDomain,
    compartment: ocid('FOUNDRY_OCI_COMPARTMENT_ID'), subnet: ocid('FOUNDRY_OCI_PRIVATE_SUBNET_ID'),
    image: ocid('FOUNDRY_OCI_IMAGE_ID') };
}
async function cli(args: string[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const child = spawn('oci', args.concat(['--output', 'json']), { shell: false, stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
    let output = '', errors = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('FOUNDRY_OCI_TIMEOUT')); }, 90000);
    child.stdout.on('data', (b: Buffer) => { output += b.toString(); if (output.length > 2_000_000) child.kill('SIGKILL'); });
    child.stderr.on('data', (b: Buffer) => { errors += b.toString(); if (errors.length > 10000) child.kill('SIGKILL'); });
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error('FOUNDRY_OCI_COMMAND_FAILED'));
      else { try { resolve(JSON.parse(output)); } catch { reject(new Error('FOUNDRY_OCI_BAD_RESPONSE')); } }
    });
  });
}
export type ProjectVm = { projectId: string; instanceId: string; privateIp: string; state: 'RUNNING' };
/** Only your trusted, authenticated operator API may call this after quota approval. */
export async function createProjectVm(projectId: string, authorizedSshPublicKey: string): Promise<ProjectVm> {
  if (!/^[a-f0-9-]{36}$/.test(projectId) || !/^ssh-ed25519 [A-Za-z0-9+/=]{40,120}(?: [^\r\n]{0,80})?$/.test(authorizedSshPublicKey)) {
    throw new Error('FOUNDRY_INVALID_VM_REQUEST');
  }
  const c = config();
  const launch = await cli(['compute', 'instance', 'launch', '--compartment-id', c.compartment,
    '--availability-domain', c.availabilityDomain, '--shape', c.shape, '--subnet-id', c.subnet,
    '--image-id', c.image, '--assign-public-ip', 'false', '--display-name', `foundry-${projectId}`,
    '--metadata', JSON.stringify({ ssh_authorized_keys: authorizedSshPublicKey }),
    '--freeform-tags', JSON.stringify({ foundry: 'true', projectId, provisionId: randomUUID() }),
    '--wait-for-state', 'RUNNING']);
  const instanceId = launch?.data?.id;
  if (typeof instanceId !== 'string' || !idPattern.test(instanceId)) throw new Error('FOUNDRY_OCI_BAD_INSTANCE');
  const nics = await cli(['compute', 'instance', 'list-vnics', '--instance-id', instanceId]);
  const ip = nics?.data?.[0]?.['private-ip'];
  if (typeof ip !== 'string' || !/^10\.|^172\.(1[6-9]|2\d|3[01])\.|^192\.168\./.test(ip)) {
    throw new Error(`FOUNDRY_VM_NETWORK_UNAVAILABLE:${instanceId}`);
  }
  return { projectId, instanceId, privateIp: ip, state: 'RUNNING' };
}
/** Requires independent authorization and DB ownership check; no browser-supplied instance IDs. */
export async function terminateProjectVm(verifiedInstanceId: string): Promise<void> {
  if (!idPattern.test(verifiedInstanceId)) throw new Error('FOUNDRY_INVALID_INSTANCE');
  await cli(['compute', 'instance', 'terminate', '--instance-id', verifiedInstanceId,
    '--preserve-boot-volume', 'false', '--force', '--wait-for-state', 'TERMINATED']);
}