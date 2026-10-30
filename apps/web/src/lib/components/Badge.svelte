<script lang="ts">
 let { value, label }: {value:string;label?:string}=$props();
 const labels:Record<string,string>={pending:'Pending',assigned:'Assigned',in_care:'In Care',extend:'Extend',released:'Pelepasan',todo:'Belum Dikerjakan',in_progress:'Sedang Dikerjakan',done:'Selesai',cancelled:'Dibatalkan',high:'Tinggi',normal:'Normal',low:'Rendah',available:'Tersedia',maintenance:'Pemeliharaan',paid:'Lunas',unpaid:'Belum Lunas',approved:'Disetujui',rejected:'Ditolak',active:'Aktif',release:'Pelepasan'};
</script>
<span class="badge {value}">{label??labels[value]??value}</span>
