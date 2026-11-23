<script lang="ts">
import { Badge, type BadgeVariant } from './badge/index.js';
let { value, label }: { value: string; label?: string } = $props();
const labels: Record<string, string> = {
    pending: 'Menunggu', assigned: 'Sudah ditempatkan', in_care: 'Dalam perawatan', extend: 'Diperpanjang', released: 'Pelepasan',
    todo: 'Belum dikerjakan', in_progress: 'Sedang dikerjakan', done: 'Selesai', cancelled: 'Dibatalkan',
    high: 'Tinggi', normal: 'Normal', low: 'Rendah', available: 'Tersedia', maintenance: 'Dalam pemeliharaan',
    paid: 'Lunas', unpaid: 'Belum lunas', approved: 'Disetujui', rejected: 'Ditolak', active: 'Aktif', release: 'Pelepasan'
};
const tones: Record<string, BadgeVariant> = {
    pending: 'warning', todo: 'warning', unpaid: 'warning', assigned: 'info', occupied: 'info', in_progress: 'info',
    in_care: 'success', done: 'success', paid: 'success', available: 'success', approved: 'success', active: 'success',
    cancelled: 'destructive', rejected: 'destructive', high: 'destructive', maintenance: 'destructive', normal: 'info'
};
</script>

<Badge variant={tones[value] ?? 'outline'} class={value === 'extend' ? 'border-transparent bg-[#f3edfb] text-[#64408f]' : undefined}>
    {label ?? labels[value] ?? 'Status belum dikenali'}
</Badge>
