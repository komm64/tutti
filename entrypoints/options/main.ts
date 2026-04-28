import { mount } from 'svelte';
import Options from './Options.svelte';
import '../popup/style.css';

const target = document.getElementById('app');
if (!target) throw new Error('#app not found');

const app = mount(Options, { target });

export default app;
