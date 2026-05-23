import { mount } from 'svelte';
import App from '../popup/App.svelte';
import '../popup/style.css';

const target = document.getElementById('app');
if (!target) throw new Error('#app not found');

const app = mount(App, { target });

export default app;
