import { mount } from 'svelte';
import Options from './Options.svelte';
import '../popup/style.css';
import { initI18n } from '../../src/utils/i18n';

const target = document.getElementById('app');
if (!target) throw new Error('#app not found');

await initI18n();

const app = mount(Options, { target });

export default app;
