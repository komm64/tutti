import { mount } from 'svelte';
import App from './App.svelte';
import './style.css';
import { initI18n } from '../../src/utils/i18n';

const target = document.getElementById('app');
if (!target) throw new Error('#app not found');

// pre-load uiLanguage override (Settings.uiLanguage が 'auto' 以外なら指定 locale を fetch)。
// init 前は t() が browser locale で動作する fallback があるので、 await しなくても
// 致命的ではないが、 await すれば初回 render から正しい言語で表示される。
await initI18n();

const app = mount(App, { target });

export default app;
