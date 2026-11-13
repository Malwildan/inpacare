<script lang="ts">
import { Badge, type BadgeVariant } from './badge/index.js';
let { value, label }: { value: string; label?: string } = $props();
const labels: Record<string, string> = {
    pending: 'Pending', assigned: 'Assigned', in_care: 'In Care', extend: 'Extend', released: 'Pelepasan',
    todo: 'Belum Dikerjakan', in_progress: 'Sedang Dikerjakan', done: 'Selesai', cancelled: 'Dibatalkan',
    high: 'Tinggi', normal: 'Normal', low: 'Rendah', available: 'Tersedia', maintenance: 'Pemeliharaan',
    paid: 'Lunas', unpaid: 'Belum Lunas', approved: 'Disetujui', rejected: 'Ditolak', active: 'Aktif', release: 'Pelepasan'
};
const tones: Record<string, BadgeVariant> = {
    pending: 'warning', todo: 'warning', unpaid: 'warning', assigned: 'info', occupied: 'info', in_progress: 'info',
    in_care: 'success', done: 'success', paid: 'success', available: 'success', approved: 'success', active: 'success',
    cancelled: 'destructive', rejected: 'destructive', high: 'destructive', maintenance: 'destructive', normal: 'info'
};
</script>

<Badge variant={tones[value] ?? 'outline'} class={value === 'extend' ? 'border-transparent bg-[#f3edfb] text-[#64408f]' : undefined}>
    {label ?? labels[value] ?? value}
</Badge>
