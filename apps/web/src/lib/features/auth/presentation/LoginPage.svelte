<script lang="ts">
	import { goto } from '$app/navigation';
	import { Eye, EyeOff } from 'lucide-svelte';
	import type { Auth, User } from '$lib/features/auth';
	import { sessionFailure } from '$lib/shared/presentation/session';
	import { Alert, AlertDescription } from '$lib/shared/ui/alert/index.js';
	import { Button } from '$lib/shared/ui/button/index.js';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/shared/ui/card/index.js';
	import { Field, FieldGroup, FieldLabel } from '$lib/shared/ui/field/index.js';
	import { Input } from '$lib/shared/ui/input/index.js';

	let { auth, landingPage }: {
		auth: Auth;
		landingPage: (user: User) => string;
	} = $props();

	let username = $state('');
	let password = $state('');
	let visible = $state(false);
	let pending = $state(false);
	let message = $state('');

	async function login(event: SubmitEvent) {
		event.preventDefault();
		pending = true;
		message = '';
		try {
			const user = await auth.login({ username, password });
			await goto(landingPage(user), { invalidateAll: true });
		} catch (error) {
			message = sessionFailure(error);
		} finally {
			pending = false;
		}
	}
</script>

<svelte:head>
	<title>Masuk · InpaCare</title>
	<meta name="description" content="Masuk ke InpaCare, sistem manajemen rawat inap." />
</svelte:head>

<div class="grid min-h-dvh grid-cols-[minmax(360px,0.86fr)_minmax(0,1.14fr)] bg-background max-[700px]:grid-cols-1 max-[700px]:grid-rows-[auto_1fr]">
	<section class="flex flex-col bg-primary px-[clamp(32px,5vw,72px)] py-11 text-primary-foreground max-[900px]:px-[30px] max-[900px]:py-9 max-[700px]:min-h-0 max-[700px]:px-6 max-[700px]:py-5">
		<a
			class="inline-flex w-fit items-baseline gap-[9px] text-primary-foreground no-underline hover:no-underline"
			href="/login"
		>
			<span class="text-[23px] font-bold tracking-[-0.03em]">InpaCare</span>
			<small class="text-[13px] font-semibold text-[#e1e6fa]">RSI</small>
		</a>

		<div class="my-auto max-w-[490px] py-[72px] max-[700px]:hidden">
			<h1 class="max-w-[20ch] text-4xl font-[650] leading-[1.24] tracking-[-0.03em] max-[900px]:text-[31px]">
				Perawatan lebih tertata,<br />keputusan lebih tepat.
			</h1>
			<p class="mt-[22px] max-w-[43ch] text-base leading-[1.7] text-[#e2e7f8]">
				Pantau siklus rawat inap, kelola rekap pasien, dan tindak lanjuti keputusan medis melalui satu
				sistem terpadu.
			</p>
		</div>
	</section>

	<main class="flex flex-col items-center justify-center bg-background px-10 pb-7 pt-12 max-[900px]:px-7 max-[700px]:justify-start max-[700px]:px-6 max-[700px]:pb-6 max-[700px]:pt-9">
		<Card class="w-full max-w-[440px] gap-0 border-border/70 py-0 shadow-sm">
			<CardHeader class="gap-2 px-6 pt-6">
				<CardTitle role="heading" aria-level={2} class="text-[27px] leading-tight tracking-[-0.025em] max-[700px]:text-[25px]">
					Selamat datang kembali
				</CardTitle>
				<CardDescription class="text-[15px] leading-relaxed">
					Masuk menggunakan akun petugas yang terdaftar pada sistem rawat inap.
				</CardDescription>
			</CardHeader>

			<CardContent class="px-6 pb-6">
				<form class="flex flex-col gap-5" onsubmit={login}>
					{#if message}
						<Alert variant="destructive">
							<AlertDescription>{message}</AlertDescription>
						</Alert>
					{/if}

					<FieldGroup>
						<Field>
							<FieldLabel for="username">ID petugas</FieldLabel>
							<Input
								id="username"
								name="username"
								autocomplete="username"
								placeholder="Masukkan ID petugas"
								bind:value={username}
								required
								maxlength={100}
								class="h-11 px-3 text-base md:text-base"
							/>
						</Field>

						<Field>
							<FieldLabel for="password">Kata sandi</FieldLabel>
							<div class="relative">
								<Input
									id="password"
									name="password"
									type={visible ? 'text' : 'password'}
									autocomplete="current-password"
									placeholder="Masukkan kata sandi"
									bind:value={password}
									required
									maxlength={200}
									class="h-12 px-3 pr-12 text-base md:text-base"
								/>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									class="absolute right-1 top-1/2 size-11 -translate-y-1/2 text-muted-foreground"
									aria-label={visible ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
									onclick={() => (visible = !visible)}
								>
									{#if visible}<EyeOff size={19} />{:else}<Eye size={19} />{/if}
								</Button>
							</div>
						</Field>
					</FieldGroup>

					<Button type="submit" size="lg" class="submit mt-0.5 h-11 w-full text-sm motion-reduce:transition-none" disabled={pending}>
						{pending ? 'Memeriksa akun…' : 'Masuk'}
					</Button>
				</form>

				<aside
					class="mt-[30px] border-t border-border pt-5 text-[13px] leading-[1.7] text-muted-foreground"
					aria-label="Informasi akun demonstrasi"
				>
					<strong class="text-sm font-[650] text-foreground">Akun demonstrasi</strong>
					<p class="mt-2 text-[13px] leading-[1.7]">
						Koordinator: <code class="font-[650] text-primary">rina</code> · Perawat:
						<code class="font-[650] text-primary">dina</code> /
						<code class="font-[650] text-primary">bima</code><br />Dokter:
						<code class="font-[650] text-primary">hendra</code> /
						<code class="font-[650] text-primary">maya</code> · Admisi:
						<code class="font-[650] text-primary">admisi</code>
					</p>
					<p class="mt-2 text-[13px] leading-[1.7]">
						Kata sandi: <code class="font-[650] text-primary">InpaCareDemo!2026</code>
					</p>
					<p class="mt-3 text-[13px] leading-[1.7]">Seluruh data di lingkungan ini adalah data sintetis.</p>
				</aside>
			</CardContent>
		</Card>
	</main>
</div>
