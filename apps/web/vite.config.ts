import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
 plugins: [tailwindcss(), sveltekit({ adapter: adapter(), preprocess: vitePreprocess() })],
 resolve: { alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) } },
 server: { port: 5173, strictPort: true }
});
