/**
 * 新しい投稿 request の開始時に固定する投稿アルゴリズム。
 * 実行中の request / retry / thread chain では切り替えない。
 */
export type PostingAlgorithm = 'next' | 'legacy';
