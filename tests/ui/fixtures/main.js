import { mount } from 'svelte';
import Fixture from './Fixture.svelte';
import CalendarFixture from './CalendarFixture.svelte';
import './styles.css';

mount(new URLSearchParams(location.search).get('surface') === 'calendar' ? CalendarFixture : Fixture, { target: document.getElementById('app') });
