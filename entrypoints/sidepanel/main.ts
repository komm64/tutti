import { mount } from 'svelte';
import App from '../popup/App.svelte';
import '../popup/style.css';
import { initI18n } from '../../src/utils/i18n';
import { bootstrapSidepanel } from './startup';

const target = document.getElementById('app');
if (!target) throw new Error('#app not found');

const app = await bootstrapSidepanel({
  target,
  initialize: initI18n,
  mount: () => mount(App, { target }),
});

export default app;
