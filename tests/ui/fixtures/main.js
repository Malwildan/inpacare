import { mount } from 'svelte';
import Fixture from './Fixture.svelte';
import CalendarFixture from './CalendarFixture.svelte';
import DashboardFixture from './DashboardFixture.svelte';
import BillingFixture from './BillingFixture.svelte';
import TasksFixture from './TasksFixture.svelte';
import './styles.css';

const surface = new URLSearchParams(location.search).get('surface');
mount(surface === 'calendar' ? CalendarFixture : surface === 'dashboard' ? DashboardFixture : surface === 'billing' ? BillingFixture : surface === 'tasks' ? TasksFixture : Fixture, { target: document.getElementById('app') });
