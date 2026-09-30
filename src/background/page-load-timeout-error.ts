import { t } from '../utils/i18n';

/**
 * The SNS compose tab never finished loading. Nothing was sent to its content
 * script, so no media was uploaded and a fresh composer can be retried safely.
 */
export class PageLoadTimeoutError extends Error {
  constructor() {
    super(t('runtimeSnsPageLoadTimeout'));
    this.name = 'PageLoadTimeoutError';
  }
}
