<script lang="ts">
    import { Check, X } from 'lucide-svelte';
    import { ObservationList } from '$lib/features/medical-records';
    import { date } from '$lib/shared/format';
    import { Button } from '$lib/shared/ui/button/index.js';
    import { Textarea } from '$lib/shared/ui/textarea/index.js';
    import Badge from '$lib/shared/ui/status-badge.svelte';
    import type { CycleRequestReview, Decision } from '../domain/models';

    let { review, disabled, onDecision }: {
        review: CycleRequestReview;
        disabled: boolean;
        onDecision: (decision: Decision['decision'], note: string) => void;
    } = $props();

    const dateTime = new Intl.DateTimeFormat('id-ID', {
        dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta',
    });
    const timestamp = (value: string) => dateTime.format(new Date(value)) + ' WIB';
    const noteId = $props.id();
    let noteInput: HTMLTextAreaElement | null = $state(null);
    const { cycle, request, placement, records, observations, approvalBlocker, blockingTasks, reviewDate } = $derived(review);

    function submit(event: SubmitEvent) {
        event.preventDefault();
        if (disabled) return;
        const decision = (event.submitter as HTMLButtonElement | null)?.value;
        if (!(decision === 'reject' || (decision === 'approve' && !approvalBlocker))) return;
        const note = noteInput?.value.trim();
        if (!note) {
            noteInput?.setCustomValidity('Isi Catatan keputusan sebelum menyimpan.');
            noteInput?.reportValidity();
            return;
        }
        onDecision(decision, note);
    }
</script>

<div class="space-y-6">
    <section class="space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
            <h3 tabindex="-1" class="font-semibold">{request.kind === 'extend' ? 'Pengajuan perpanjangan' : 'Pengajuan pelepasan'}</h3>
            <Badge value={request.status} label={request.status === 'pending' ? 'Menunggu keputusan' : undefined} />
        </div>
        <dl class="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt class="text-muted-foreground">Pasien</dt><dd class="break-words font-medium">{cycle.patientName}</dd><dd>{cycle.medicalRecordNo}</dd></div>
            <div><dt class="text-muted-foreground">Status rekap</dt><dd><Badge value={cycle.status} /></dd></div>
            <div><dt class="text-muted-foreground">Pemohon</dt><dd>{request.requestedBy}</dd></div>
            <div><dt class="text-muted-foreground">Waktu pengajuan</dt><dd><time datetime={request.createdAt}>{timestamp(request.createdAt)}</time></dd></div>
            <div>
                <dt class="text-muted-foreground">{request.kind === 'extend' ? 'Tanggal selesai yang diminta' : 'Waktu pelepasan yang diminta'}</dt>
                <dd>
                    {#if request.kind === 'extend'}
                        {request.requestedEnd ? date(request.requestedEnd) : 'Belum diisi'}
                    {:else if request.status === 'pending'}
                        Saat disetujui. Tanggal tinjauan {date(reviewDate)}.
                    {:else}
                        Saat disetujui
                    {/if}
                </dd>
            </div>
            <div><dt class="text-muted-foreground">Alasan</dt><dd class="break-words whitespace-pre-wrap">{request.reason}</dd></div>
        </dl>
    </section>

    <section class="space-y-3 border-t pt-4">
        <h3 class="font-semibold">Penempatan dan kendala</h3>
        {#if placement}
            <div class="flex flex-wrap items-center gap-2 text-sm">
                <strong>{placement.room ?? 'Ruangan tidak tersedia'}</strong>
                <span>{date(placement.startsOn)} – {date(placement.endsOn)}</span>
                <Badge value={placement.status} />
            </div>
        {:else}
            <p class="text-sm text-muted-foreground">Rekap belum memiliki penempatan.</p>
        {/if}
        {#if request.status === 'pending'}
            {#if approvalBlocker}
                <p class="rounded-md border p-3 text-sm" id={`${noteId}-blocker`}>{approvalBlocker}</p>
            {:else}
                <p class="text-sm text-muted-foreground">Saat ditinjau, tidak ada kendala yang menghalangi persetujuan.</p>
            {/if}
            {#if blockingTasks.length}
                <ul class="space-y-2 text-sm">
                    {#each blockingTasks as task (task.id)}
                        <li class="rounded-md border p-3">
                            <div class="flex flex-wrap items-center gap-2"><strong>{task.title}</strong><Badge value={task.status} /></div>
                            <p class="mt-1 text-muted-foreground">{task.picName} · {timestamp(task.startsAt)} – {timestamp(task.endsAt)}</p>
                        </li>
                    {/each}
                </ul>
            {/if}
        {/if}
    </section>

    <section class="space-y-3 border-t pt-4">
        <h3 class="font-semibold">Rekam medis terbaru</h3>
        {#each records as record (record.id)}
            <article class="space-y-2 rounded-md border p-3 text-sm">
                <h4 class="font-medium">{record.doctorName} · <time datetime={record.recordDate}>{date(record.recordDate)}</time></h4>
                <dl class="space-y-2 break-words whitespace-pre-wrap">
                    <div><dt class="text-muted-foreground">Diagnosis</dt><dd>{record.diagnosis}</dd></div>
                    <div><dt class="text-muted-foreground">Tindakan</dt><dd>{record.treatment}</dd></div>
                    <div><dt class="text-muted-foreground">Catatan</dt><dd>{record.notes || 'Belum ada catatan.'}</dd></div>
                </dl>
            </article>
        {:else}
            <p class="text-sm text-muted-foreground">Belum ada rekam medis yang dapat dibaca.</p>
        {/each}
    </section>

    <section class="space-y-3 border-t pt-4">
        <h3 class="font-semibold">Observasi keperawatan terbaru</h3>
        <ObservationList {observations} />
    </section>

    {#if request.status === 'pending'}
        <form method="post" aria-label="Keputusan dokter" onsubmit={submit} class="space-y-2 border-t pt-4">
            <label for={noteId} class="block text-sm font-medium">Catatan keputusan (wajib)</label>
            <Textarea id={noteId} name="note" rows={3} maxlength={500} required {disabled}
                bind:ref={noteInput} oninput={() => noteInput?.setCustomValidity('')} />
            <div class="form-actions">
                <Button variant="outline" type="submit" name="decision" value="reject" class="h-12" {disabled}><X aria-hidden="true" /> Tolak</Button>
                <Button type="submit" name="decision" value="approve" class="h-12" disabled={disabled || !!approvalBlocker}
                    aria-describedby={approvalBlocker ? `${noteId}-blocker` : undefined}><Check aria-hidden="true" /> Setujui</Button>
            </div>
        </form>
    {:else}
        <section class="space-y-2 border-t pt-4">
            <h3 class="font-semibold">Riwayat keputusan</h3>
            <p class="text-sm">
                {request.decidedBy ?? 'Dokter'}
                {#if request.decidedAt} · <time datetime={request.decidedAt}>{timestamp(request.decidedAt)}</time>{/if}
            </p>
            {#if request.note}<p class="break-words whitespace-pre-wrap text-sm">{request.note}</p>{/if}
        </section>
    {/if}
</div>
