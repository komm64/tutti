import './style.css';
import { initI18n, t } from '../../src/utils/i18n';

await initI18n();
document.documentElement.lang = browser.i18n.getUILanguage();
document.title = t('videoPostingPreparingTitle');
document.querySelector('#title')!.textContent = t('videoPostingPreparingTitle');
document.querySelector('#message')!.textContent = t('videoPostingPreparingMessage');
