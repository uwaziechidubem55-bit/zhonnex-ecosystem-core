import { zhonnexIdentityClient } from '../../core-applications/identity-auth/supabase/client';
import {
  Chain,
  hasSettledProductPayment,
  ownershipMessage,
  validateChain,
  verifyBytes
} from '../../archaios/index';
import * as crypto from 'crypto';

interface DeliveryManifest {
  assetId: string;
  vaultStoragePath: string;
  downloadTokenSignature: string;
  expirationTimestamp: number;
}

/**
 * Product vault. Signs a short download only after Archaios has recorded the payment
 * and the logged-in user has proved they hold the paying key.
 */
export class ProductVaultManager {
  private static readonly TOKEN_SECRET_ALGO = 'sha256';
  private static readonly VAULT_SIGNING_KEY = process.env.ZHONNEX_VAULT_SIGNING_SECRET;

  /**
   * Generates a 15-minute download signature.
   * Refuses if the Archaios chain is invalid, the purchase is missing, or the key proof fails.
   */
  public static async generateSecuredStreamManifest(
    userBearerToken: string,
    targetAssetId: string,
    chain: Chain,
    buyerAddress: string,
    ownershipSignature: string
  ): Promise<DeliveryManifest | null> {
    if (!this.VAULT_SIGNING_KEY || this.VAULT_SIGNING_KEY.length < 32) {
      throw new Error('CRITICAL ARCHITECTURE CONFIGURATION ERROR: ZHONNEX_VAULT_SIGNING_SECRET must be at least 32 characters and must not live in source.');
    }

    const { data: { user }, error } = await zhonnexIdentityClient.auth.getUser(userBearerToken);
    if (error || !user) {
      console.error('[VAULT DENIAL] Access token evaluation failed for target asset allocation request.');
      return null;
    }

    if (validateChain(chain) !== null) {
      console.error('[VAULT DENIAL] Archaios chain rejected.');
      return null;
    }
    if (!verifyBytes(ownershipMessage(chain.networkId, user.id, targetAssetId), ownershipSignature, buyerAddress)) {
      console.error('[VAULT DENIAL] Archaios key does not belong to this signed-in user.');
      return null;
    }
    if (!hasSettledProductPayment(chain, buyerAddress, targetAssetId)) {
      console.error('[VAULT DENIAL] No settled Archaios payment for this asset.');
      return null;
    }

    const accessExpirationWindowInSeconds = 900;
    const expiryTime = Math.floor(Date.now() / 1000) + accessExpirationWindowInSeconds;
    const accessPayload = `${user.id}:${targetAssetId}:${expiryTime}`;
    const cryptographicSignature = crypto
      .createHmac(this.TOKEN_SECRET_ALGO, this.VAULT_SIGNING_KEY)
      .update(accessPayload)
      .digest('hex');

    return {
      assetId: targetAssetId,
      vaultStoragePath: `production-vault-storage/distribution-binaries/${targetAssetId}.bin`,
      downloadTokenSignature: cryptographicSignature,
      expirationTimestamp: expiryTime
    };
  }

  public static verifyStreamManifestSignature(manifest: Omit<DeliveryManifest, 'vaultStoragePath'>, userId: string): boolean {
    if (!this.VAULT_SIGNING_KEY || this.VAULT_SIGNING_KEY.length < 32) {
      return false;
    }
    if (Date.now() / 1000 > manifest.expirationTimestamp) {
      console.warn(`[VAULT ALERT] Terminated expired token signature intercept for user reference: ${userId}`);
      return false;
    }

    const reconstructedPayload = `${userId}:${manifest.assetId}:${manifest.expirationTimestamp}`;
    const referenceSignature = crypto
      .createHmac(this.TOKEN_SECRET_ALGO, this.VAULT_SIGNING_KEY)
      .update(reconstructedPayload)
      .digest('hex');
    const offered = Buffer.from(manifest.downloadTokenSignature);
    const expected = Buffer.from(referenceSignature);
    if (offered.length !== expected.length) {
      return false;
    }
    return crypto.timingSafeEqual(offered, expected);
  }
}