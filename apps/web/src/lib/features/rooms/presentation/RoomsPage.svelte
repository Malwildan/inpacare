<script lang="ts">
import { toast } from '$lib/shared/ui/sonner/index.js';
import { invalidateAll } from '$app/navigation';
import type { Rooms, RoomsPageData, Room, RoomItem, EditRoom } from '$lib/features/rooms';
import { sessionFailure } from '$lib/shared/presentation/session';
import { formText } from '$lib/shared/presentation/form';
import { Eye, Pencil, Plus, Save, Trash2, X } from 'lucide-svelte';
import { money } from '$lib/shared/format';
import MoneyInput from '$lib/shared/ui/MoneyInput.svelte';
import { Badge, type BadgeVariant } from '$lib/shared/ui/badge/index.js';
import { Button } from '$lib/shared/ui/button/index.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/shared/ui/card/index.js';
import Modal from '$lib/shared/ui/dialog-frame.svelte';
import { Field, FieldGroup, FieldLabel } from '$lib/shared/ui/field/index.js';
import { Input } from '$lib/shared/ui/input/index.js';
import FormSelect from '$lib/shared/ui/form-select.svelte';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '$lib/shared/ui/table/index.js';

let { data, roomService, cycleId = '', roomSearch = '' }: {
    data: RoomsPageData;
    roomService: Rooms;
    cycleId?: string;
    roomSearch?: string;
} = $props();

/* Filters stay local state so the listing behaves exactly as before: no URL round trip. */
let query = $state('');
$effect(() => { query = roomSearch; });
let classFilter = $state('');
let statusFilter = $state('');

let busy = $state(false);

type RoomDialogView = 'create' | 'detail' | 'edit' | 'addItem' | 'itemEdit' | 'remove';
let dialogView = $state<RoomDialogView | null>(null);
let roomId = $state<string | null>(null);
let itemId = $state<string | null>(null);
let returnToDetail = $state(false);
let removeKind = $state<'room' | 'item'>('room');

const canManage = $derived(data.user.role === 'PERAWAT' && data.user.coordinator);
const nurses = $derived(data.reference.staff.filter((staff) => staff.role === 'PERAWAT'));
const classes = $derived([...new Set(data.rooms.map((room: Room) => room.roomClass))]);
const available = $derived(data.rooms.filter((room: Room) => room.status === 'available' && room.occupants === 0).length);
const occupied = $derived(data.rooms.filter((room: Room) => room.status === 'available' && room.occupants > 0).length);
const maintenance = $derived(data.rooms.filter((room: Room) => room.status === 'maintenance').length);
const rooms = $derived(data.rooms.filter((room: Room) => (!query || (room.name + ' ' + room.id).toLocaleLowerCase().includes(query.toLocaleLowerCase())) &&
    (!classFilter || room.roomClass === classFilter) && (!statusFilter ||
    (statusFilter === 'occupied' ? room.status === 'available' && room.occupants > 0 :
        statusFilter === 'available' ? room.status === 'available' && room.occupants === 0 : room.status === statusFilter))));

const room = $derived(roomById(roomId));
const item = $derived(itemById(room, itemId));
const dialogTitles: Record<RoomDialogView, string> = { create: 'Tambah ruangan', detail: 'Detail ruangan', edit: 'Ubah ruangan', addItem: 'Tambah perlengkapan', itemEdit: 'Ubah perlengkapan', remove: 'Hapus ruangan?' };

function roomById(id: string | null | undefined): Room | null {
    if (!id) return null;
    return data.rooms.find((room: Room) => room.id === id) ?? null;
}

function itemById(room: Room | null, id: string | null | undefined): RoomItem | null {
    if (!room || !id) return null;
    return room.items.find((item: RoomItem) => item.id === id) ?? null;
}

function statusLabel(room: Room): string {
    return room.status === 'maintenance' ? 'Dalam pemeliharaan' : room.occupants > 0 ? 'Terisi' : 'Tersedia';
}

function statusTone(room: Room): BadgeVariant {
    if (room.status === 'maintenance') return 'destructive';
    return room.occupants > 0 ? 'info' : 'success';
}

function closeDialog() {
    if (busy) return;
    if (returnToDetail && dialogView !== 'detail' && room) {
        dialogView = 'detail';
        returnToDetail = false;
        itemId = null;
    } else { dialogView = null; roomId = null; itemId = null; returnToDetail = false; }
}
function enterAction(view: RoomDialogView, id: string | null = null, targetItem: string | null = null) {
    returnToDetail = dialogView === 'detail';
    roomId = id;
    itemId = targetItem;
    dialogView = view;
}
function openCreate() { enterAction('create'); }
function openView(id: string) { enterAction('detail', id); }
function openEdit(id: string) { enterAction('edit', id); }
function openAddItem(id: string) { enterAction('addItem', id); }
function openItemEdit(id: string, targetItem: string) { enterAction('itemEdit', id, targetItem); }
function openRemoveRoom(target: Room) { removeKind = 'room'; enterAction('remove', target.id); }
function openRemoveItem(target: Room, targetItem: RoomItem) { removeKind = 'item'; enterAction('remove', target.id, targetItem.id); }
async function submit(operation: () => Promise<unknown>, removedRoom = false) {
    if (busy) return false;
    busy = true;
    const toastId = toast.loading('Menyimpan perubahan…');
    try {
        await operation();
        const refreshed = await invalidateAll().then(() => true, () => false);
        if (returnToDetail && !removedRoom && room) { dialogView = 'detail'; returnToDetail = false; itemId = null; }
        else { dialogView = null; returnToDetail = false; roomId = null; itemId = null; }
        if (refreshed) toast.success('Perubahan berhasil disimpan.', { id: toastId });
        else toast.warning('Perubahan ruang tersimpan. Muat ulang halaman untuk melihat data terbaru.', { id: toastId });
        return true;
    } catch (cause) { toast.error(sessionFailure(cause, 'save', 'data ruang dan fasilitas'), { id: toastId }); return false; }
    finally { busy = false; }
}
async function removeConfirmed() {
    if (!room || busy) return;
    const target = room;
    if (removeKind === 'item' && item) {
        const targetItem = item;
        await submit(() => roomService.removeItem(target.id, targetItem.id, { expectedVersion: target.version }));
    } else if (removeKind === 'room') await submit(() => roomService.remove(target.id, { expectedVersion: target.version }), true);
}
</script>

<svelte:head><title>Ruang rawat inap | InpaCare</title></svelte:head>
{#if cycleId}<Button href={`/dashboard?${new URLSearchParams({ cycleId })}`} variant="outline" class="mb-4">Kembali ke rekap pasien</Button>{/if}

<div class="flex flex-col gap-6">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div class="min-w-0">
            <h1 class="text-[26px] font-bold leading-tight tracking-[-0.03em] sm:text-[28px]">Ruang rawat inap</h1>
        </div>
        {#if canManage}
            <Button size="lg" class="h-11 shrink-0 px-4 text-sm" onclick={openCreate}>
                <Plus aria-hidden="true" /> Tambah ruangan
            </Button>
        {/if}
    </header>

    <section aria-label="Ringkasan ruangan" class="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
            <CardHeader class="gap-0.5">
                <CardTitle class="text-2xl font-semibold tabular-nums">{data.rooms.length}</CardTitle>
                <CardDescription class="text-[13px]">Total ruangan</CardDescription>
            </CardHeader>
        </Card>
        <Card>
            <CardHeader class="gap-0.5">
                <CardTitle class="text-2xl font-semibold tabular-nums">{available}</CardTitle>
                <CardDescription class="text-[13px]">Tersedia</CardDescription>
            </CardHeader>
        </Card>
        <Card>
            <CardHeader class="gap-0.5">
                <CardTitle class="text-2xl font-semibold tabular-nums">{occupied}</CardTitle>
                <CardDescription class="text-[13px]">Terisi</CardDescription>
            </CardHeader>
        </Card>
        <Card>
            <CardHeader class="gap-0.5">
                <CardTitle class="text-2xl font-semibold tabular-nums">{maintenance}</CardTitle>
                <CardDescription class="text-[13px]">Dalam pemeliharaan</CardDescription>
            </CardHeader>
        </Card>
    </section>

    <Card class="gap-0 py-0">
        <CardHeader class="gap-1 border-b px-4 py-4 sm:px-5">
            <CardTitle role="heading" aria-level={2} class="text-[17px] font-semibold">Daftar ruangan</CardTitle>
            <CardDescription>{rooms.length} dari {data.rooms.length} ruangan</CardDescription>
        </CardHeader>
        <CardContent class="px-0">
            <div class="flex flex-col gap-3 border-b px-4 py-4 sm:grid sm:grid-cols-2 sm:items-end sm:px-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
                <Field class="sm:col-span-2 lg:col-span-1">
                    <FieldLabel for="room-filter-query">Cari ID atau nama ruangan</FieldLabel>
                    <Input id="room-filter-query" type="search" bind:value={query} placeholder="Cari ruangan..." class="h-11 px-3 text-base md:text-base" />
                </Field>
                <Field>
                    <FieldLabel for="room-filter-class">Tipe ruang</FieldLabel>
                    <FormSelect id="room-filter-class" bind:value={classFilter} class="w-full" options={[{ value: "", label: "Semua tipe" }, ...(classes).map((type) => ({ value: type, label: (type) }))]} />
                </Field>
                <Field>
                    <FieldLabel for="room-filter-status">Status</FieldLabel>
                    <FormSelect id="room-filter-status" bind:value={statusFilter} class="w-full" options={[{ value: "", label: "Semua status" }, { value: "available", label: "Tersedia" }, { value: "occupied", label: "Terisi" }, { value: "maintenance", label: "Dalam pemeliharaan" }]} />
                </Field>
            </div>

            <Table>
                <TableHeader>
                    <TableRow class="bg-muted/60 hover:bg-muted/60">
                        <TableHead class="px-4 whitespace-normal sm:px-5">ID / nama ruangan</TableHead>
                        <TableHead class="hidden md:table-cell">Tipe ruang</TableHead>
                        <TableHead class="hidden md:table-cell">Penanggung jawab</TableHead>
                        <TableHead class="hidden md:table-cell">Biaya inventaris</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead class="px-4 text-right sm:px-5">Aksi</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {#each rooms as room (room.id)}
                        <TableRow>
                            <TableCell class="px-4 align-top whitespace-normal sm:px-5">
                                <span class="block text-sm font-semibold text-foreground">{room.name}</span>
                                <span class="mt-1 block text-xs text-muted-foreground">{room.id} · {room.occupants}/{room.capacity} tempat terisi</span>
                            </TableCell>
                            <TableCell class="hidden align-top md:table-cell">{room.roomClass}</TableCell>
                            <TableCell class="hidden align-top md:table-cell">{room.picName ?? 'Belum ditentukan'}</TableCell>
                            <TableCell class="hidden align-top tabular-nums md:table-cell">{money(room.totalCost)}</TableCell>
                            <TableCell class="align-top"><Badge variant={statusTone(room)}>{statusLabel(room)}</Badge></TableCell>
                            <TableCell class="px-4 align-top sm:px-5">
                                <div class="action-buttons action-buttons--table">
                                    <Button variant="outline" class="h-11 px-3 text-[13px]" onclick={() => openView(room.id)}><Eye aria-hidden="true" /> Lihat</Button>
                                    {#if canManage}
                                        <Button variant="outline" class="h-11 px-3 text-[13px]" onclick={() => openEdit(room.id)}><Pencil aria-hidden="true" /> Ubah</Button>
                                        <Button variant="outline" class="h-11 px-3 text-[13px]" onclick={() => openAddItem(room.id)}><Plus aria-hidden="true" /> Item</Button>
                                        <Button
                                            variant="destructive"
                                            class="h-11 px-3 text-[13px]"
                                            disabled={busy || room.occupants > 0}
                                            title={room.occupants > 0 ? 'Kosongkan penempatan aktif sebelum menghapus' : undefined}
                                            onclick={() => openRemoveRoom(room)}><Trash2 aria-hidden="true" /> Hapus</Button>
                                    {/if}
                                </div>
                            </TableCell>
                        </TableRow>
                    {:else}
                        <TableRow class="hover:bg-transparent">
                            <TableCell colspan={6} class="px-4 py-11 text-center text-sm whitespace-normal text-muted-foreground sm:px-5">Tidak ada ruangan yang cocok dengan filter.</TableCell>
                        </TableRow>
                    {/each}
                </TableBody>
            </Table>
        </CardContent>
    </Card>
</div>

{#if dialogView && (dialogView === 'detail' || canManage)}
<Modal title={dialogView === 'remove' && removeKind === 'item' ? 'Hapus perlengkapan?' : dialogTitles[dialogView]}
 description={room ? `${room.name} · ${room.id}` : undefined}
 {busy} protectChanges={['create', 'edit', 'addItem', 'itemEdit'].includes(dialogView)}
 formKey={`${dialogView}-${roomId ?? ''}-${itemId ?? ''}`}
 backLabel={returnToDetail ? 'Kembali ke detail ruangan' : undefined} onclose={closeDialog}>
    {#snippet children(close)}
    {#if dialogView === 'create'}<form class="flex flex-col gap-5" onsubmit={(event) => { event.preventDefault(); const f = new FormData(event.currentTarget); const dailyRate = formText(f, 'dailyRate') || '0'; void submit(() => roomService.create({ name: formText(f, 'name'), roomClass: formText(f, 'roomClass'), capacity: Number(formText(f, 'capacity')), picId: formText(f, 'picId') || null, dailyRate })); }}>
            <FieldGroup class="grid gap-4 sm:grid-cols-2">
                <Field>
                    <FieldLabel for="room-name">Nama ruang</FieldLabel>
                    <Input id="room-name" name="name" maxlength={80} required placeholder="Contoh: Melati 01" class="h-11 px-3 text-base md:text-base" />
                </Field>
                <Field>
                    <FieldLabel for="room-class">Tipe ruang</FieldLabel>
                    <Input id="room-class" name="roomClass" maxlength={40} required placeholder="Kelas I" class="h-11 px-3 text-base md:text-base" />
                </Field>
                <Field>
                    <FieldLabel for="room-capacity">Kapasitas</FieldLabel>
                    <Input id="room-capacity" name="capacity" type="number" min={1} max={20} value="1" required class="h-11 px-3 text-base md:text-base" />
                </Field>
                <Field>
                    <FieldLabel for="room-pic">Penanggung jawab</FieldLabel>
                    <FormSelect id="room-pic" name="picId" class="w-full" options={[{ value: "", label: "Pilih perawat" }, ...(nurses).map((nurse) => ({ value: nurse.id, label: (nurse.name) }))]} />
                </Field>
                <MoneyInput id="room-daily-rate" label="Tarif per hari (Rp)" name="dailyRate" value="0" class="sm:col-span-2" hint="Contoh: 250.000 atau 250.000,50" />
            </FieldGroup>
            <div class="form-actions">
                <Button type="button" variant="outline" class="h-11 px-4" disabled={busy} onclick={close}><X aria-hidden="true" /> Batal</Button>
                <Button type="submit" class="h-11 px-4" disabled={busy}><Save aria-hidden="true" /> {busy ? 'Menyimpan…' : 'Simpan ruangan'}</Button>
            </div>
        </form>
    {:else if room}
        {#if dialogView === 'detail'}            <dl class="grid grid-cols-2 gap-4">
                <div class="flex min-w-0 flex-col gap-1">
                    <dt class="text-[13px] text-muted-foreground">Tipe ruang</dt>
                    <dd class="text-sm font-semibold">{room.roomClass}</dd>
                </div>
                <div class="flex min-w-0 flex-col gap-1">
                    <dt class="text-[13px] text-muted-foreground">Kapasitas</dt>
                    <dd class="text-sm font-semibold">{room.capacity} pasien</dd>
                </div>
                <div class="flex min-w-0 flex-col gap-1">
                    <dt class="text-[13px] text-muted-foreground">Tarif per hari</dt>
                    <dd class="text-sm font-semibold">{money(room.dailyRate)}</dd>
                </div>
                <div class="flex min-w-0 flex-col gap-1">
                    <dt class="text-[13px] text-muted-foreground">Total biaya inventaris</dt>
                    <dd class="text-sm font-semibold">{money(room.totalCost)}</dd>
                </div>
            </dl>
            <section class="flex flex-col gap-3">
                <h3 class="text-[15px] font-semibold">Perlengkapan dan fasilitas</h3>
                {#if room.items.length}
                    <ul class="flex flex-col divide-y divide-border rounded-lg border">
                        {#each room.items as item (item.id)}
                            <li class="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
                                <span class="min-w-0 text-sm text-foreground">{item.name} · {item.category} · {item.quantity} × {money(item.unitPrice)}</span>
                                {#if canManage}
                                    <div class="action-buttons">
                                        <Button variant="link" class="h-11 px-2 text-[13px]" onclick={() => openItemEdit(room.id, item.id)}><Pencil aria-hidden="true" /> Ubah</Button>
                                        <Button variant="destructive" class="h-11 px-2 text-[13px]" onclick={() => openRemoveItem(room, item)}><Trash2 aria-hidden="true" /> Hapus</Button>
                                    </div>
                                {/if}
                            </li>
                        {/each}
                    </ul>
                {:else}
                    <p class="text-sm text-muted-foreground">Belum ada perlengkapan yang dicatat.</p>
                {/if}
            </section>
            <div class="form-actions">
                {#if canManage}
                    <Button variant="outline" class="h-11 px-4" onclick={() => openAddItem(room.id)}><Plus aria-hidden="true" /> Tambah perlengkapan</Button>
                {/if}
                <Button variant="outline" class="h-11 px-4" disabled={busy} onclick={close}><X aria-hidden="true" /> Tutup detail ruangan</Button>
            </div>

        {:else if dialogView === 'edit'}<form class="flex flex-col gap-5" onsubmit={(event) => { event.preventDefault(); const f = new FormData(event.currentTarget); const dailyRate = formText(f, 'dailyRate'); void submit(() => roomService.update(room.id, { name: formText(f, 'name'), roomClass: formText(f, 'roomClass'), capacity: Number(formText(f, 'capacity')), status: formText(f, 'status') as EditRoom['status'], picId: formText(f, 'picId') || null, dailyRate, expectedVersion: room.version })); }}>
                <FieldGroup class="grid gap-4 sm:grid-cols-2">
                    <Field>
                        <FieldLabel for="room-edit-name">Nama ruang</FieldLabel>
                        <Input id="room-edit-name" name="name" required value={room.name} class="h-11 px-3 text-base md:text-base" />
                    </Field>
                    <Field>
                        <FieldLabel for="room-edit-class">Tipe ruang</FieldLabel>
                        <Input id="room-edit-class" name="roomClass" required value={room.roomClass} class="h-11 px-3 text-base md:text-base" />
                    </Field>
                    <Field>
                        <FieldLabel for="room-edit-capacity">Kapasitas</FieldLabel>
                        <Input id="room-edit-capacity" name="capacity" type="number" min={1} max={20} required value={room.capacity} class="h-11 px-3 text-base md:text-base" />
                    </Field>
                    <Field>
                        <FieldLabel for="room-edit-status">Status</FieldLabel>
                        <FormSelect id="room-edit-status" name="status" value={room.status} class="w-full" options={[{ value: "available", label: "Tersedia" }, { value: "maintenance", label: "Dalam pemeliharaan" }]} />
                    </Field>
                    <Field>
                        <FieldLabel for="room-edit-pic">Penanggung jawab</FieldLabel>
                        <FormSelect id="room-edit-pic" name="picId" value={room.picId ?? ''} class="w-full" options={[{ value: "", label: "Tidak ditentukan" }, ...(nurses).map((nurse) => ({ value: nurse.id, label: (nurse.name) }))]} />
                    </Field>
                    <MoneyInput id="room-edit-daily-rate" label="Tarif per hari (Rp)" name="dailyRate" value={room.dailyRate} required hint="Contoh: 250.000 atau 250.000,50" />
                </FieldGroup>
                <div class="form-actions">
                    <Button type="button" variant="outline" class="h-11 px-4" disabled={busy} onclick={close}><X aria-hidden="true" /> Batal</Button>
                    <Button type="submit" class="h-11 px-4" disabled={busy}><Save aria-hidden="true" /> {busy ? 'Menyimpan…' : 'Simpan'}</Button>
                </div>
            </form>
        {:else if dialogView === 'addItem'}<form class="flex flex-col gap-5" onsubmit={(event) => { event.preventDefault(); const f = new FormData(event.currentTarget); void submit(() => roomService.addItem(room.id, { name: formText(f, 'name'), category: formText(f, 'category'), quantity: Number(formText(f, 'quantity')), unitPrice: formText(f, 'unitPrice') })); }}>
                <FieldGroup class="grid gap-4 sm:grid-cols-2">
                    <Field>
                        <FieldLabel for="item-name">Nama fasilitas</FieldLabel>
                        <Input id="item-name" name="name" required class="h-11 px-3 text-base md:text-base" />
                    </Field>
                    <Field>
                        <FieldLabel for="item-category">Kategori</FieldLabel>
                        <Input id="item-category" name="category" required placeholder="Perlengkapan / alat" class="h-11 px-3 text-base md:text-base" />
                    </Field>
                    <Field>
                        <FieldLabel for="item-quantity">Jumlah</FieldLabel>
                        <Input id="item-quantity" name="quantity" type="number" min={1} value="1" required class="h-11 px-3 text-base md:text-base" />
                    </Field>
                    <MoneyInput id="item-unit-price" label="Harga satuan" name="unitPrice" value="0" required />
                </FieldGroup>
                {#if room.items.length}
                    <div class="flex flex-col gap-1 rounded-lg bg-muted/60 p-3">
                        <span class="text-xs font-medium text-muted-foreground">Inventaris saat ini</span>
                        {#each room.items as item (item.id)}
                            <span class="text-[13px] text-foreground">{item.name} · {item.quantity} × {money(item.unitPrice)}</span>
                        {/each}
                    </div>
                {/if}
                <div class="form-actions">
                    <Button type="button" variant="outline" class="h-11 px-4" disabled={busy} onclick={close}><X aria-hidden="true" /> Batal</Button>
                    <Button type="submit" class="h-11 px-4" disabled={busy}><Plus aria-hidden="true" /> {busy ? 'Menyimpan…' : 'Tambah perlengkapan'}</Button>
                </div>
            </form>
        {:else if dialogView === 'itemEdit' && item}<form class="flex flex-col gap-5" onsubmit={(event) => { event.preventDefault(); const f = new FormData(event.currentTarget); void submit(() => roomService.updateItem(room.id, item.id, { name: formText(f, 'name'), category: formText(f, 'category'), quantity: Number(formText(f, 'quantity')), unitPrice: String(formText(f, 'unitPrice')), expectedVersion: room.version })); }}>
                <FieldGroup class="grid gap-4 sm:grid-cols-2">
                    <Field>
                        <FieldLabel for="item-edit-name">Nama fasilitas</FieldLabel>
                        <Input id="item-edit-name" name="name" required value={item.name} class="h-11 px-3 text-base md:text-base" />
                    </Field>
                    <Field>
                        <FieldLabel for="item-edit-category">Kategori</FieldLabel>
                        <Input id="item-edit-category" name="category" required value={item.category} class="h-11 px-3 text-base md:text-base" />
                    </Field>
                    <Field>
                        <FieldLabel for="item-edit-quantity">Jumlah</FieldLabel>
                        <Input id="item-edit-quantity" name="quantity" type="number" min={1} required value={item.quantity} class="h-11 px-3 text-base md:text-base" />
                    </Field>
                    <MoneyInput id="item-edit-unit-price" label="Harga satuan" name="unitPrice" value={item.unitPrice} required />
                </FieldGroup>
                <div class="form-actions">
                    <Button type="button" variant="outline" class="h-11 px-4" disabled={busy} onclick={close}><X aria-hidden="true" /> Batal</Button>
                    <Button type="submit" class="h-11 px-4" disabled={busy}><Save aria-hidden="true" /> {busy ? 'Menyimpan…' : 'Simpan perlengkapan'}</Button>
                </div>
            </form>
        {:else if dialogView === 'remove'}
            <form class="flex flex-col gap-4" onsubmit={(event) => { event.preventDefault(); void removeConfirmed(); }}>
                <p>{#if removeKind === 'item'}Perlengkapan <strong>{item?.name}</strong> akan dihapus dari ruangan <strong>{room.name}</strong>.{:else}Ruang <strong>{room.name}</strong> akan diarsipkan dan tidak muncul dalam daftar ruang.{/if} Tindakan ini tidak dapat dibatalkan.</p>
                <div class="form-actions"><Button variant="outline" disabled={busy} onclick={close}><X aria-hidden="true" /> Batal</Button><Button type="submit" variant="destructive-confirm" disabled={busy}><Trash2 aria-hidden="true" /> {busy ? 'Menghapus…' : 'Hapus'}</Button></div>
            </form>
        {/if}
    {/if}
    {/snippet}
</Modal>
{/if}
