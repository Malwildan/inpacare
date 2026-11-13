import { mount } from 'svelte';
import Fixture from './Fixture.svelte';
import '../../../apps/web/src/app.css';

mount(Fixture, { target: document.getElementById('app') });
