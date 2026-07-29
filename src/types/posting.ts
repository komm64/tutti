/**
 * 新しい投稿 request が通るroot orchestrator profile。
 * 実行中の request / retry / thread chain では切り替えない。
 */
export type PostingAlgorithm = 'next' | 'legacy';
