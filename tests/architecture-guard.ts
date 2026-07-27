export interface TemporaryArchitectureAllowance {
  fingerprint: string;
  reason: string;
  owner: string;
  expiresOn: string;
}

interface ArchitectureGuardInput {
  guard: string;
  violations: readonly string[];
  allowances?: readonly TemporaryArchitectureAllowance[];
  today?: string;
}

/**
 * Applies temporary architecture allowances and reports every policy problem
 * in one deterministic error. Allowances are exact, owned, expiring, and must
 * be removed as soon as the matching violation disappears.
 */
export function assertArchitectureGuard({
  guard,
  violations,
  allowances = [],
  today = new Date().toISOString().slice(0, 10),
}: ArchitectureGuardInput): void {
  const uniqueViolations = [...new Set(violations)].sort();
  const allowanceFingerprints = new Set<string>();
  const policyErrors: string[] = [];

  for (const allowance of allowances) {
    if (!allowance.fingerprint.trim()) {
      policyErrors.push('allowance has an empty fingerprint');
    }
    if (allowance.reason.trim().length < 20) {
      policyErrors.push(
        `${allowance.fingerprint || '(empty fingerprint)'}: reason must be at least 20 characters`,
      );
    }
    if (!/^Issue #\d+$/.test(allowance.owner)) {
      policyErrors.push(
        `${allowance.fingerprint || '(empty fingerprint)'}: owner must be "Issue #<number>"`,
      );
    }
    if (!isIsoDate(allowance.expiresOn)) {
      policyErrors.push(
        `${allowance.fingerprint || '(empty fingerprint)'}: expiresOn must be YYYY-MM-DD`,
      );
    } else if (allowance.expiresOn < today) {
      policyErrors.push(
        `${allowance.fingerprint || '(empty fingerprint)'}: expired on ${allowance.expiresOn}`,
      );
    }
    if (allowanceFingerprints.has(allowance.fingerprint)) {
      policyErrors.push(`${allowance.fingerprint}: duplicate allowance`);
    }
    allowanceFingerprints.add(allowance.fingerprint);
  }

  const unallowed = uniqueViolations.filter(
    (violation) => !allowanceFingerprints.has(violation),
  );
  const violationFingerprints = new Set(uniqueViolations);
  const stale = [...allowanceFingerprints]
    .filter((fingerprint) => fingerprint && !violationFingerprints.has(fingerprint))
    .sort();

  if (policyErrors.length === 0 && unallowed.length === 0 && stale.length === 0) {
    return;
  }

  const sections = [
    formatSection('violations', unallowed),
    formatSection('allowance policy', policyErrors.sort()),
    formatSection('stale allowances', stale),
  ].filter((section): section is string => section !== null);
  throw new Error(`[architecture:${guard}] failed\n${sections.join('\n')}`);
}

function formatSection(label: string, entries: readonly string[]): string | null {
  if (entries.length === 0) return null;
  return `${label} (${entries.length}):\n${entries.map((entry) => `- ${entry}`).join('\n')}`;
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp)
    && new Date(timestamp).toISOString().slice(0, 10) === value;
}
