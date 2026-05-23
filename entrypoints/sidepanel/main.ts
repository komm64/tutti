import { mount } from 'svelte';
import App from '../popup/App.svelte';
import '../popup/style.css';
import { initI18n } from '../../src/utils/i18n';

const target = document.getElementById('app');
if (!target) throw new Error('#app not found');

await initI18n();

const app = mount(App, { target });

export default app;
