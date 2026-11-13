<script lang="ts">
import { invalidateAll } from '$app/navigation';
import type { Rooms, RoomsPageData, Room, RoomItem, EditRoom } from '$lib/features/rooms';
import { sessionFailure } from '$lib/shared/presentation/session';
import { formText } from '$lib/shared/presentation/form';
import { Plus } from 'lucide-svelte';
import { Alert, AlertDescription } from '$lib/shared/ui/alert/index.js';
import { Badge, type BadgeVariant } from '$lib/shared/ui/badge/index.js';
import { Button } from '$lib/shared/ui/button/index.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/shared/ui/card/index.js';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from '$lib/shared/ui/alert-dialog/index.js';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '$lib/shared/ui/dialog/index.js';
import { Field, FieldGroup, FieldLabel } from '$lib/shared/ui/field/index.js';
import { Input } from '$lib/shared/ui/input/index.js';
import { NativeSelect, NativeSelectOption } from '$lib/shared/ui/native-select/index.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '$lib/shared/ui/table/index.js';

let { data, roomService }: {
    data: RoomsPageData;
    roomService: Rooms;
} = $props();

/* Filters stay local state so the listing behaves exactly as before: no URL round trip. */
let query = $state('');
let classFilter = $state('');
let statusFilter = $state('');

let busy = $state(false);
let error = $state('');
let success = $state('');

/* One controlled dialog per task. Targeted rows are stored by id so the dialog body
   always renders the current server copy instead of a stale object after invalidateAll(). */
let createOpen = $state(false);
let viewId = $state<string | null>(null);
let viewOpen = $state(false);
let editId = $state<string | null>(null);
let editOpen = $state(false);
let addItemId = $state<string | null>(null);
let addItemOpen = $state(false);
let itemEditTarget = $state<{ roomId: string; itemId: string } | null>(null);
let itemEditOpen = $state(false);
let removeRoomId = $state<string | null>(null);
let removeItemTarget = $state<{ roomId: string; itemId: string } | null>(null);
let removeOpen = $state(false);

const isNurse = $derived(data.user.role === 'PERAWAT');
const nurses = $derived(data.reference.staff.filter((staff) => staff.role === 'PERAWAT'));
const classes = $derived([...new Set(data.rooms.map((room: Room) => room.roomClass))]);
const available = $derived(data.rooms.filter((room: Room) => room.status === 'available' && room.occupants === 0).length);
const occupied = $derived(data.rooms.filter((room: Room) => room.status === 'available' && room.occupants > 0).length);
const maintenance = $derived(data.rooms.filter((room: Room) => room.status === 'maintenance').length);
const rooms = $derived(data.rooms.filter((room: Room) => (!query || (room.name + ' ' + room.id).toLocaleLowerCase().includes(query.toLocaleLowerCase())) &&
    (!classFilter || room.roomClass === classFilter) && (!statusFilter ||
    (statusFilter === 'occupied' ? room.status === 'available' && room.occupants > 0 :
        statusFilter === 'available' ? room.status === 'available' && room.occupants === 0 : room.status === statusFilter))));

const anyDialogOpen = $derived(createOpen || viewOpen || editOpen || addItemOpen || itemEditOpen || removeOpen);

const viewRoom = $derived(roomById(viewId));
const editRoom = $derived(roomById(editId));
const addItemRoom = $derived(roomById(addItemId));
const itemEditRoom = $derived(roomById(itemEditTarget?.roomId));
const itemEditItem = $derived(itemById(itemEditRoom, itemEditTarget?.itemId));
const removeRoom = $derived(roomById(removeRoomId));
const removeItemRoom = $derived(roomById(removeItemTarget?.roomId));
const removeItem = $derived(itemById(removeItemRoom, removeItemTarget?.itemId));

function roomById(id: string | null | undefined): Room | null {
    if (!id) return null;
    return data.rooms.find((room: Room) => room.id === id) ?? null;
}

function itemById(room: Room | null, id: string | null | undefined): RoomItem | null {
    if (!room || !id) return null;
    return room.items.find((item: RoomItem) => item.id === id) ?? null;
}

function money(value: string): string {
    return 'Rp ' + Number(value).toLocaleString('id-ID');
}

function statusLabel(room: Room): string {
    return room.status === 'maintenance' ? 'Maintenance' : room.occupants > 0 ? 'Occupied' : 'Available';
}

function statusTone(room: Room): BadgeVariant {
    if (room.status === 'maintenance') return 'destructive';
    return room.occupants > 0 ? 'info' : 'success';
}

function startAction() {
    error = '';
    success = '';
}

async function submit(operation: () => Promise<unknown>) {
    if (busy) return;
    busy = true;
    error = '';
    success = '';
    try {
        await operation();
        await invalidateAll();
        createOpen = false;
        editOpen = false;
        addItemOpen = false;
        itemEditOpen = false;
        success = 'Perubahan berhasil disimpan.';
    } catch (e) {
        error = sessionFailure(e);
    } finally {
        busy = false;
    }
}

function openCreate() {
    startAction();
    createOpen = true;
}

function openView(id: string) {
    startAction();
    viewId = id;
    viewOpen = true;
}

function openEdit(id: string) {
    startAction();
    editId = id;
    editOpen = true;
}

function openAddItem(roomId: string) {
    startAction();
    addItemId = roomId;
    addItemOpen = true;
}

function openItemEdit(roomId: string, itemId: string) {
    startAction();
    itemEditTarget = { roomId, itemId };
    itemEditOpen = true;
}

function openRemoveRoom(room: Room) {
    startAction();
    removeItemTarget = null;
    removeRoomId = room.id;
    removeOpen = true;
}

function openRemoveItem(room: Room, item: RoomItem) {
    startAction();
    removeRoomId = null;
    removeItemTarget = { roomId: room.id, itemId: item.id };
    removeOpen = true;
}

async function removeRoomConfirmed() {
    const room = removeRoom;
    if (!room) return;
    await submit(() => roomService.remove(room.id, { expectedVersion: room.version }));
}

async function removeItemConfirmed() {
    const room = removeItemRoom;
    const item = removeItem;
    if (!room || !item) return;
    await submit(() => roomService.removeItem(room.id, item.id, { expectedVersion: room.version }));
}
</script>

<svelte:head><title>Manajemen Ruangan | InpaCare</title></svelte:head>

<div class="flex flex-col gap-6">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div class="min-w-0">
            <h1 class="text-[26px] font-bold leading-tight tracking-[-0.03em] sm:text-[28px]">Manajemen Ruangan</h1>
            <p class="mt-1.5 max-w-[60ch] text-[15px] leading-relaxed text-muted-foreground">Kelola data, inventaris, dan ketersediaan ruangan rawat inap.</p>
        </div>
        {#if isNurse}
            <Button size="lg" class="h-11 shrink-0 px-4 text-sm" onclick={openCreate}>
                <Plus aria-hidden="true" /> Tambah ruangan
            </Button>
        {/if}
    </header>

    {#if error && !anyDialogOpen}
        <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
    {/if}
    {#if success}
        <Alert role="status" class="border-success/30 bg-success-soft text-success">
            <AlertDescription class="font-medium text-success">{success}</AlertDescription>
        </Alert>
    {/if}

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
                <CardDescription class="text-[13px]">Available</CardDescription>
            </CardHeader>
        </Card>
        <Card>
            <CardHeader class="gap-0.5">
                <CardTitle class="text-2xl font-semibold tabular-nums">{occupied}</CardTitle>
                <CardDescription class="text-[13px]">Occupied</CardDescription>
            </CardHeader>
        </Card>
        <Card>
            <CardHeader class="gap-0.5">
                <CardTitle class="text-2xl font-semibold tabular-nums">{maintenance}</CardTitle>
                <CardDescription class="text-[13px]">Maintenance</CardDescription>
            </CardHeader>
        </Card>
    </section>

    <Card class="gap-0 py-0">
        <CardHeader class="gap-1 border-b px-4 py-4 sm:px-5">
            <CardTitle class="text-[17px] font-semibold">Daftar ruangan</CardTitle>
            <CardDescription>{rooms.length} dari {data.rooms.length} ruangan</CardDescription>
        </CardHeader>
        <CardContent class="px-0">
            <div class="flex flex-col gap-3 border-b px-4 py-4 sm:grid sm:grid-cols-2 sm:items-end sm:px-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
                <Field class="sm:col-span-2 lg:col-span-1">
                    <FieldLabel for="room-filter-query">Cari ID atau nama ruangan</FieldLabel>
                    <Input id="room-filter-query" type="search" bind:value={query} placeholder="Cari ruangan..." class="h-11 px-3 text-base md:text-base" />
                </Field>
                <Field>
                    <FieldLabel for="room-filter-class">Tipe</FieldLabel>
                    <NativeSelect id="room-filter-class" bind:value={classFilter} class="w-full">
                        <NativeSelectOption value="">Semua tipe</NativeSelectOption>
                        {#each classes as type}<NativeSelectOption value={type}>{type}</NativeSelectOption>{/each}
                    </NativeSelect>
                </Field>
                <Field>
                    <FieldLabel for="room-filter-status">Status</FieldLabel>
                    <NativeSelect id="room-filter-status" bind:value={statusFilter} class="w-full">
                        <NativeSelectOption value="">Semua status</NativeSelectOption>
                        <NativeSelectOption value="available">Available</NativeSelectOption>
                        <NativeSelectOption value="occupied">Occupied</NativeSelectOption>
                        <NativeSelectOption value="maintenance">Maintenance</NativeSelectOption>
                    </NativeSelect>
                </Field>
            </div>

            <Table>
                <TableHeader>
                    <TableRow class="bg-muted/60 hover:bg-muted/60">
                        <TableHead class="px-4 sm:px-5">ID / nama ruangan</TableHead>
                        <TableHead class="hidden md:table-cell">Tipe</TableHead>
                        <TableHead class="hidden md:table-cell">PIC</TableHead>
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
                                <div class="flex flex-wrap justify-end gap-2">
                                    <Button variant="outline" class="h-11 px-3 text-[13px]" onclick={() => openView(room.id)}>Lihat</Button>
                                    {#if isNurse}
                                        <Button variant="outline" class="h-11 px-3 text-[13px]" onclick={() => openEdit(room.id)}>Ubah</Button>
                                        <Button variant="outline" class="h-11 px-3 text-[13px]" onclick={() => openAddItem(room.id)}><Plus aria-hidden="true" /> Item</Button>
                                        <Button
                                            variant="destructive"
                                            class="h-11 px-3 text-[13px]"
                                            disabled={busy || room.occupants > 0}
                                            title={room.occupants > 0 ? 'Kosongkan penempatan aktif sebelum menghapus' : undefined}
                                            onclick={() => openRemoveRoom(room)}>Hapus</Button>
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

<Dialog bind:open={createOpen}>
    <DialogContent class="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
            <DialogTitle>Tambah ruangan</DialogTitle>
            <DialogDescription>Lengkapi data ruangan baru. Kolom bertanda wajib tidak boleh kosong.</DialogDescription>
        </DialogHeader>
        <form class="flex flex-col gap-5" onsubmit={(event) => { event.preventDefault(); const f = new FormData(event.currentTarget); void submit(() => roomService.create({ name: formText(f, 'name'), roomClass: formText(f, 'roomClass'), capacity: Number(formText(f, 'capacity')), picId: formText(f, 'picId') || null, dailyRate: formText(f, 'dailyRate') || '0' })); }}>
            {#if error}<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>{/if}
            <FieldGroup class="grid gap-4 sm:grid-cols-2">
                <Field>
                    <FieldLabel for="room-name">Nama ruangan</FieldLabel>
                    <Input id="room-name" name="name" maxlength={80} required placeholder="Contoh: Melati 01" class="h-11 px-3 text-base md:text-base" />
                </Field>
                <Field>
                    <FieldLabel for="room-class">Tipe</FieldLabel>
                    <Input id="room-class" name="roomClass" maxlength={40} required placeholder="Kelas I" class="h-11 px-3 text-base md:text-base" />
                </Field>
                <Field>
                    <FieldLabel for="room-capacity">Kapasitas</FieldLabel>
                    <Input id="room-capacity" name="capacity" type="number" min={1} max={20} value="1" required class="h-11 px-3 text-base md:text-base" />
                </Field>
                <Field>
                    <FieldLabel for="room-pic">PIC</FieldLabel>
                    <NativeSelect id="room-pic" name="picId" class="w-full">
                        <NativeSelectOption value="">Pilih perawat</NativeSelectOption>
                        {#each nurses as nurse}<NativeSelectOption value={nurse.id}>{nurse.name}</NativeSelectOption>{/each}
                    </NativeSelect>
                </Field>
                <Field class="sm:col-span-2">
                    <FieldLabel for="room-daily-rate">Tarif harian (Rp)</FieldLabel>
                    <Input id="room-daily-rate" name="dailyRate" type="number" min={0} step="0.01" value="0" class="h-11 px-3 text-base md:text-base" />
                </Field>
            </FieldGroup>
            <DialogFooter>
                <Button type="button" variant="outline" class="h-11 px-4" onclick={() => (createOpen = false)}>Batal</Button>
                <Button type="submit" class="h-11 px-4" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan ruangan'}</Button>
            </DialogFooter>
        </form>
    </DialogContent>
</Dialog>

<Dialog bind:open={editOpen}>
    <DialogContent class="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
            <DialogTitle>Ubah ruangan</DialogTitle>
            <DialogDescription>{editRoom ? `${editRoom.name} · ${editRoom.id}` : 'Perbarui data ruangan.'}</DialogDescription>
        </DialogHeader>
        {#if editRoom}
            {@const room = editRoom}
            <form class="flex flex-col gap-5" onsubmit={(event) => { event.preventDefault(); const f = new FormData(event.currentTarget); void submit(() => roomService.update(room.id, { name: formText(f, 'name'), roomClass: formText(f, 'roomClass'), capacity: Number(formText(f, 'capacity')), status: formText(f, 'status') as EditRoom['status'], picId: formText(f, 'picId') || null, dailyRate: formText(f, 'dailyRate'), expectedVersion: room.version })); }}>
                {#if error}<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>{/if}
                <FieldGroup class="grid gap-4 sm:grid-cols-2">
                    <Field>
                        <FieldLabel for="room-edit-name">Nama</FieldLabel>
                        <Input id="room-edit-name" name="name" required value={room.name} class="h-11 px-3 text-base md:text-base" />
                    </Field>
                    <Field>
                        <FieldLabel for="room-edit-class">Tipe</FieldLabel>
                        <Input id="room-edit-class" name="roomClass" required value={room.roomClass} class="h-11 px-3 text-base md:text-base" />
                    </Field>
                    <Field>
                        <FieldLabel for="room-edit-capacity">Kapasitas</FieldLabel>
                        <Input id="room-edit-capacity" name="capacity" type="number" min={1} max={20} required value={room.capacity} class="h-11 px-3 text-base md:text-base" />
                    </Field>
                    <Field>
                        <FieldLabel for="room-edit-status">Status</FieldLabel>
                        <NativeSelect id="room-edit-status" name="status" value={room.status} class="w-full">
                            <NativeSelectOption value="available">Available</NativeSelectOption>
                            <NativeSelectOption value="maintenance">Maintenance</NativeSelectOption>
                        </NativeSelect>
                    </Field>
                    <Field>
                        <FieldLabel for="room-edit-pic">PIC</FieldLabel>
                        <NativeSelect id="room-edit-pic" name="picId" value={room.picId ?? ''} class="w-full">
                            <NativeSelectOption value="">Tidak ditentukan</NativeSelectOption>
                            {#each nurses as nurse}<NativeSelectOption value={nurse.id}>{nurse.name}</NativeSelectOption>{/each}
                        </NativeSelect>
                    </Field>
                    <Field>
                        <FieldLabel for="room-edit-daily-rate">Tarif harian</FieldLabel>
                        <Input id="room-edit-daily-rate" name="dailyRate" type="number" min={0} step="0.01" required value={room.dailyRate} class="h-11 px-3 text-base md:text-base" />
                    </Field>
                </FieldGroup>
                <DialogFooter>
                    <Button type="button" variant="outline" class="h-11 px-4" onclick={() => (editOpen = false)}>Batal</Button>
                    <Button type="submit" class="h-11 px-4" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</Button>
                </DialogFooter>
            </form>
        {/if}
    </DialogContent>
</Dialog>

<Dialog bind:open={viewOpen}>
    <DialogContent class="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
            <DialogTitle>Detail ruangan</DialogTitle>
            <DialogDescription>{viewRoom ? `${viewRoom.name} · ${viewRoom.roomClass} · ${viewRoom.capacity} tempat` : 'Informasi ruangan dan inventaris.'}</DialogDescription>
        </DialogHeader>
        {#if viewRoom}
            {@const room = viewRoom}
            {#if error && !addItemOpen && !itemEditOpen}
                <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
            {/if}
            <dl class="grid grid-cols-2 gap-4">
                <div class="flex min-w-0 flex-col gap-1">
                    <dt class="text-[13px] text-muted-foreground">Tipe</dt>
                    <dd class="text-sm font-semibold">{room.roomClass}</dd>
                </div>
                <div class="flex min-w-0 flex-col gap-1">
                    <dt class="text-[13px] text-muted-foreground">Kapasitas</dt>
                    <dd class="text-sm font-semibold">{room.capacity} pasien</dd>
                </div>
                <div class="flex min-w-0 flex-col gap-1">
                    <dt class="text-[13px] text-muted-foreground">Tarif harian</dt>
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
                                {#if isNurse}
                                    <div class="flex items-center gap-1">
                                        <Button variant="link" class="h-11 px-2 text-[13px]" onclick={() => openItemEdit(room.id, item.id)}>Ubah</Button>
                                        <Button variant="link" class="h-11 px-2 text-[13px] text-destructive" onclick={() => openRemoveItem(room, item)}>Hapus</Button>
                                    </div>
                                {/if}
                            </li>
                        {/each}
                    </ul>
                {:else}
                    <p class="text-sm text-muted-foreground">Belum ada item yang dicatat.</p>
                {/if}
            </section>
            <DialogFooter>
                {#if isNurse}
                    <Button variant="outline" class="h-11 px-4" onclick={() => openAddItem(room.id)}><Plus aria-hidden="true" /> Tambah item</Button>
                {/if}
                <Button class="h-11 px-4" onclick={() => (viewOpen = false)}>Tutup</Button>
            </DialogFooter>
        {/if}
    </DialogContent>
</Dialog>

<Dialog bind:open={addItemOpen}>
    <DialogContent class="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
            <DialogTitle>Tambah item</DialogTitle>
            <DialogDescription>{addItemRoom ? `Catat perlengkapan baru untuk ${addItemRoom.name}.` : 'Catat perlengkapan baru.'}</DialogDescription>
        </DialogHeader>
        {#if addItemRoom}
            {@const room = addItemRoom}
            <form class="flex flex-col gap-5" onsubmit={(event) => { event.preventDefault(); const f = new FormData(event.currentTarget); void submit(() => roomService.addItem(room.id, { name: formText(f, 'name'), category: formText(f, 'category'), quantity: Number(formText(f, 'quantity')), unitPrice: formText(f, 'unitPrice') })); }}>
                {#if error}<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>{/if}
                <FieldGroup class="grid gap-4 sm:grid-cols-2">
                    <Field>
                        <FieldLabel for="item-name">Nama item</FieldLabel>
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
                    <Field>
                        <FieldLabel for="item-unit-price">Harga satuan</FieldLabel>
                        <Input id="item-unit-price" name="unitPrice" type="number" min={0} step="0.01" value="0" required class="h-11 px-3 text-base md:text-base" />
                    </Field>
                </FieldGroup>
                {#if room.items.length}
                    <div class="flex flex-col gap-1 rounded-lg bg-muted/60 p-3">
                        <span class="text-xs font-medium text-muted-foreground">Inventaris saat ini</span>
                        {#each room.items as item (item.id)}
                            <span class="text-[13px] text-foreground">{item.name} · {item.quantity} × {money(item.unitPrice)}</span>
                        {/each}
                    </div>
                {/if}
                <DialogFooter>
                    <Button type="button" variant="outline" class="h-11 px-4" onclick={() => (addItemOpen = false)}>Batal</Button>
                    <Button type="submit" class="h-11 px-4" disabled={busy}>{busy ? 'Menyimpan…' : 'Tambah item'}</Button>
                </DialogFooter>
            </form>
        {/if}
    </DialogContent>
</Dialog>

<Dialog bind:open={itemEditOpen}>
    <DialogContent class="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
            <DialogTitle>Ubah item</DialogTitle>
            <DialogDescription>{itemEditItem ? `${itemEditItem.name} · ${itemEditRoom?.name ?? ''}` : 'Perbarui data item inventaris.'}</DialogDescription>
        </DialogHeader>
        {#if itemEditRoom && itemEditItem}
            {@const room = itemEditRoom}
            {@const item = itemEditItem}
            <form class="flex flex-col gap-5" onsubmit={(event) => { event.preventDefault(); const f = new FormData(event.currentTarget); void submit(() => roomService.updateItem(room.id, item.id, { name: formText(f, 'name'), category: formText(f, 'category'), quantity: Number(formText(f, 'quantity')), unitPrice: String(formText(f, 'unitPrice')), expectedVersion: room.version })); }}>
                {#if error}<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>{/if}
                <FieldGroup class="grid gap-4 sm:grid-cols-2">
                    <Field>
                        <FieldLabel for="item-edit-name">Nama</FieldLabel>
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
                    <Field>
                        <FieldLabel for="item-edit-unit-price">Harga satuan</FieldLabel>
                        <Input id="item-edit-unit-price" name="unitPrice" type="number" min={0} step="0.01" required value={item.unitPrice} class="h-11 px-3 text-base md:text-base" />
                    </Field>
                </FieldGroup>
                <DialogFooter>
                    <Button type="button" variant="outline" class="h-11 px-4" onclick={() => (itemEditOpen = false)}>Batal</Button>
                    <Button type="submit" class="h-11 px-4" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan item'}</Button>
                </DialogFooter>
            </form>
        {/if}
    </DialogContent>
</Dialog>

<AlertDialog bind:open={removeOpen}>
    <AlertDialogContent>
        <AlertDialogHeader>
            <AlertDialogTitle>{removeItemTarget ? 'Hapus item?' : 'Hapus ruangan?'}</AlertDialogTitle>
            <AlertDialogDescription>
                {#if removeItemTarget}
                    Item {removeItem ? removeItem.name : 'ini'} akan dihapus dari ruangan {removeItemRoom?.name ?? 'ini'}. Tindakan ini tidak dapat dibatalkan.
                {:else if removeRoom}
                    Ruangan {removeRoom.name} ({removeRoom.id}) akan dihapus. Tindakan ini tidak dapat dibatalkan.
                {:else}
                    Data akan dihapus. Tindakan ini tidak dapat dibatalkan.
                {/if}
            </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
            <AlertDialogCancel class="h-11 px-4">Batal</AlertDialogCancel>
            <AlertDialogAction
                variant="destructive"
                class="h-11 px-4"
                disabled={busy}
                onclick={() => { if (removeItemTarget) void removeItemConfirmed(); else void removeRoomConfirmed(); }}>Hapus</AlertDialogAction>
        </AlertDialogFooter>
    </AlertDialogContent>
</AlertDialog>
