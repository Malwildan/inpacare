<script lang="ts">
import { goto } from '$app/navigation';
import { Eye, EyeOff } from 'lucide-svelte';
import type { Auth, User } from '$lib/features/auth';
import { sessionFailure } from '$lib/shared/presentation/session';
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
    }
    catch (error) {
        message = sessionFailure(error);
    }
    finally {
        pending = false;
    }
}
</script>

<svelte:head>
	<title>Masuk · InpaCare</title>
	<meta name="description" content="Masuk ke InpaCare, sistem manajemen rawat inap." />
</svelte:head>

<div class="login-page">
	<section class="login-info" aria-labelledby="login-heading">
		<a class="login-brand" href="/login"><span>InpaCare</span><small>RSI</small></a>
		<div class="intro">
			<h1 id="login-heading">Perawatan lebih tertata,<br />keputusan lebih tepat.</h1>
			<p>Pantau siklus rawat inap, kelola rekap pasien, dan tindak lanjuti keputusan medis melalui satu sistem terpadu.</p>
		</div>
	</section>

	<main class="login-form-area">
		<div class="login-form">
			<h2>Selamat datang kembali</h2>
			<p class="form-intro">Masuk menggunakan akun petugas yang terdaftar pada sistem rawat inap.</p>

			<form onsubmit={login}>
				{#if message}<div class="error" role="alert">{message}</div>{/if}
				<div class="field">
					<label for="username">ID petugas</label>
					<input
						id="username"
						name="username"
						autocomplete="username"
						placeholder="Masukkan ID petugas"
						bind:value={username}
						required
						maxlength="100"
					/>
				</div>
				<div class="field">
					<label for="password">Kata sandi</label>
					<div class="password-input">
						<input
							id="password"
							name="password"
							type={visible ? 'text' : 'password'}
							autocomplete="current-password"
							placeholder="Masukkan kata sandi"
							bind:value={password}
							required
							maxlength="200"
						/>
						<button
							type="button"
							class="visibility-toggle"
							aria-label={visible ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
							onclick={() => (visible = !visible)}
						>
							{#if visible}<EyeOff size={19} />{:else}<Eye size={19} />{/if}
						</button>
					</div>
				</div>
				<button class="button primary submit" disabled={pending}>
					{pending ? 'Memeriksa akun…' : 'Masuk'}
				</button>
			</form>

			<aside class="demo-info" aria-label="Informasi akun demonstrasi">
				<strong>Akun demonstrasi</strong>
				<p>Koordinator: <code>rina</code> · Perawat: <code>dina</code> / <code>bima</code><br />Dokter: <code>hendra</code> / <code>maya</code> · Admisi: <code>admisi</code></p>
				<p>Kata sandi: <code>InpaCareDemo!2026</code></p>
				<p class="synthetic-note">Seluruh data di lingkungan ini adalah data sintetis.</p>
			</aside>
		</div>
	</main>
</div>

<style>
	.login-page {
		display: grid;
		grid-template-columns: minmax(360px, 0.86fr) minmax(0, 1.14fr);
		min-height: 100dvh;
		background: var(--surface);
	}

	.login-info {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
		padding: 44px clamp(32px, 5vw, 72px);
		background: #35478f;
		color: #fff;
	}

	.login-brand {
		display: inline-flex;
		align-items: baseline;
		gap: 9px;
		width: fit-content;
		color: #fff;
	}

	.login-brand:hover {
		text-decoration: none;
	}

	.login-brand span {
		font-size: 23px;
		font-weight: 700;
		letter-spacing: -0.03em;
	}

	.login-brand small {
		color: #e1e6fa;
		font-size: 13px;
		font-weight: 600;
	}

	.intro {
		max-width: 490px;
		margin: auto 0;
		padding: 72px 0;
	}

	.intro h1 {
		max-width: 20ch;
		font-size: 36px;
		line-height: 1.24;
		letter-spacing: -0.03em;
		font-weight: 650;
	}

	.intro p {
		max-width: 43ch;
		margin-top: 22px;
		color: #e2e7f8;
		font-size: 16px;
		line-height: 1.7;
	}

	.login-form-area {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-width: 0;
		padding: 48px 40px 28px;
		background: var(--surface);
	}

	.login-form {
		width: 100%;
		max-width: 440px;
	}

	.login-form h2 {
		font-size: 27px;
		letter-spacing: -0.025em;
	}

	.form-intro {
		margin-top: 9px;
		font-size: 15px;
		line-height: 1.6;
	}

	.login-form form {
		display: flex;
		flex-direction: column;
		gap: 20px;
		margin-top: 30px;
	}

	.login-form .field label {
		color: var(--text);
	}

	.password-input {
		position: relative;
	}

	.password-input input {
		padding-right: 52px;
	}

	.visibility-toggle {
		position: absolute;
		top: 2px;
		right: 2px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border: 0;
		border-radius: 7px;
		background: transparent;
		color: #515d70;
	}

	.visibility-toggle:hover {
		background: #eef0f5;
	}

	.submit {
		width: 100%;
		margin-top: 2px;
	}

	.demo-info {
		margin-top: 30px;
		padding-top: 20px;
		border-top: 1px solid var(--border);
	}

	.demo-info strong {
		font-size: 14px;
		font-weight: 650;
	}

	.demo-info p {
		margin-top: 8px;
		color: var(--muted);
		font-size: 13px;
		line-height: 1.7;
	}

	.demo-info code {
		font-family: inherit;
		font-weight: 650;
		color: #35478f;
	}

	.demo-info .synthetic-note {
		margin-top: 12px;
		color: #4f5b6d;
	}

	.login-form-area footer {
		margin-top: 32px;
		color: var(--muted);
		font-size: 12px;
		text-align: center;
	}

	@media (max-width: 900px) {
		.login-page {
			grid-template-columns: minmax(300px, 0.8fr) minmax(0, 1.2fr);
		}

		.login-info {
			padding: 36px 30px;
		}

		.intro h1 {
			font-size: 31px;
		}

		.login-form-area {
			padding-right: 28px;
			padding-left: 28px;
		}
	}

	@media (max-width: 700px) {
		.login-page {
			grid-template-columns: 1fr;
			min-height: 100dvh;
		}

		.login-info {
			min-height: auto;
			padding: 20px 24px;
		}

		.intro {
			display: none;
		}

		.login-form-area {
			justify-content: flex-start;
			padding: 34px 24px 24px;
		}

		.login-form {
			max-width: 440px;
		}

		.login-form h2 {
			font-size: 25px;
		}

		.login-form-area footer {
			margin-top: 28px;
		}
	}
</style>
