import { mount } from 'svelte';
import Fixture from './Fixture.svelte';
import CalendarFixture from './CalendarFixture.svelte';
import DashboardFixture from './DashboardFixture.svelte';
import './styles.css';

const surface = new URLSearchParams(location.search).get('surface');
mount(surface === 'calendar' ? CalendarFixture : surface === 'dashboard' ? DashboardFixture : Fixture, { target: document.getElementById('app') });
