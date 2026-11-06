<script lang="ts">
    import { onMount } from 'svelte';
    import SwaggerUIBundle from 'swagger-ui-dist/swagger-ui-bundle.js';
    import 'swagger-ui-dist/swagger-ui.css';
    import { csrfToken } from '$lib/shared/presentation/session';
    import { createSwaggerRequestInterceptor } from './request-interceptor';

    onMount(() => {
        const ui = SwaggerUIBundle({
            dom_id: '#swagger-ui',
            url: '/api-docs/openapi.json',
            deepLinking: true,
            validatorUrl: null,
            persistAuthorization: false,
            requestInterceptor: createSwaggerRequestInterceptor(window.location.origin, csrfToken)
        });
        return () => ui.destroy();
    });
</script>

<svelte:head>
    <title>InpaCare API Explorer</title>
</svelte:head>

<header class="explorer-header">
    <h1>InpaCare API Explorer</h1>
    <nav aria-label="Shared tools">
        <a href="/">Back to InpaCare</a>
        <a href="/db/" data-sveltekit-reload>Database (pgAdmin)</a>
    </nav>
    <p>Requests use your signed-in account. Changes made here affect the application data.</p>
</header>
<div id="swagger-ui"></div>

<style>
    .explorer-header { max-width: 1460px; margin: 0 auto; padding: 24px 20px 12px; }
    h1 { margin-bottom: 12px; font-size: 24px; }
    nav { display: flex; flex-wrap: wrap; gap: 20px; }
    p { margin-top: 12px; color: var(--muted); }
</style>
