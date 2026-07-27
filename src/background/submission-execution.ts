export interface ReleasableReservation {
  release: () => void;
}

export interface GuardedSubmissionOptions<TReservation extends ReleasableReservation, TResult> {
  reserve: () => Promise<TReservation>;
  run: (reservation: TReservation) => Promise<TResult>;
  cleanup: () => Promise<void>;
}

/**
 * The only transition from a decoded real/preview request into posting work.
 * Reservation always happens first, and both reservation and request-owned
 * transfer resources are released on every exit path.
 */
export async function executeGuardedSubmission<
  TReservation extends ReleasableReservation,
  TResult,
>(options: GuardedSubmissionOptions<TReservation, TResult>): Promise<TResult> {
  let reservation: TReservation | undefined;
  try {
    reservation = await options.reserve();
    return await options.run(reservation);
  } finally {
    try {
      reservation?.release();
    } finally {
      await options.cleanup();
    }
  }
}
