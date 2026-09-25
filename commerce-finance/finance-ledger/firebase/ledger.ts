import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { getFirestore, Firestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

interface TransactionLog {
  transactionId: string;
  buyerZhonnexUid: string;
  targetDigitalAssetId: string;
  fiatAmountInCents: number;
  currencyCode: string;
  merchantAllocationCents: number;
  platformFeeCents: number;
  immutableTimestamp: Timestamp | FieldValue;
  settlementStatus: 'SETTLED' | 'ROLLBACK_FAILED' | 'RECONCILIATION_REQUIRED';
}

const firebaseCredentialsJson = process.env.ZHONNEX_FIREBASE_ADMIN_CREDENTIALS;
if (!firebaseCredentialsJson) {
  throw new Error('CRITICAL ARCHITECTURE CONFIGURATION ERROR: Missing micro-service ledger authorization payloads.');
}

const serviceAccountConfig = JSON.parse(firebaseCredentialsJson);

const zhonnexCoreApp: App = getApps().length === 0 
  ? initializeApp({ credential: cert(serviceAccountConfig) }) 
  : getApps()[0];

export const velocityLedgerDb: Firestore = getFirestore(zhonnexCoreApp);

/**
 * Production transaction handler executing atomic calculations for cross-border asset splits.
 * Uses strict isolation guarantees preventing multi-write double spending fraud.
 */
export async function executeAtomicFinSetlement(
  payload: Omit<TransactionLog, 'transactionId' | 'immutableTimestamp' | 'settlementStatus'>
): Promise<{ success: boolean; transactionReference: string }> {
  
  const ledgerDocRef = velocityLedgerDb.collection('zhonnex_velocity_ledger').doc();
  const balanceAuditRef = velocityLedgerDb.collection('zhonnex_merchant_balances').doc(payload.targetDigitalAssetId);

  try {
    await velocityLedgerDb.runTransaction(async (atomicTransaction) => {
      // 1. Double check asset validation rules inside the transaction safety window
      const assetSnapshot = await atomicTransaction.get(balanceAuditRef);
      if (!assetSnapshot.exists) {
        throw new Error('Target commercial merchant profile does not exist in ecosystem indices.');
      }

      // 2. Draft the permanent transactional ledger audit entry
      const atomicLedgerEntry: TransactionLog = {
        transactionId: ledgerDocRef.id,
        ...payload,
        immutableTimestamp: FieldValue.serverTimestamp(), // Forces server clock over client spoofing
        settlementStatus: 'SETTLED'
      };

      atomicTransaction.set(ledgerDocRef, atomicLedgerEntry);

      // 3. Credit merchant allocations instantaneously across internal balances
      atomicTransaction.update(balanceAuditRef, {
        totalWithdrawableRevenueCents: FieldValue.increment(payload.merchantAllocationCents),
        lastTransactionProcessedAt: FieldValue.serverTimestamp()
      });
    });

    return { success: true, transactionReference: ledgerDocRef.id };
  } catch (executionError) {
    console.error(`[CRITICAL LEDGER TRANSACTION FAILURE] Financial processing aborted safely. Reason:`, executionError);
    return { success: false, transactionReference: '' };
  }
}
