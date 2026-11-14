import { test, expect } from '@playwright/test';

test('task filters survive direct navigation, reload and history', async ({ page }) => {
 await page.goto('/login');
 await page.getByLabel('ID petugas').fill('rina');
 await page.getByLabel('Kata sandi', { exact: true }).fill('InpaCareDemo!2026');
 await page.getByRole('button', { name: 'Masuk', exact: true }).click();
 await expect(page).toHaveURL(/\/dashboard$/);
 await page.goto('/tasks?search=unmatched-refactor&status=todo&priority=high&roomId=R-001&patientId=PT-001&picId=U-DINA&from=2026-11-01&to=2026-11-03&page=1');
 await expect(page.getByLabel('Cari tugas atau pasien')).toHaveValue('unmatched-refactor');
 await page.getByText('Filter lanjutan').click();
 await expect(page.getByRole('combobox', { name: /^Status/ })).toHaveValue('todo');
 await expect(page.getByRole('combobox', { name: /^Prioritas/ })).toHaveValue('high');
 await page.reload();
 await expect(page.getByLabel('Cari tugas atau pasien')).toHaveValue('unmatched-refactor');
 await page.getByLabel('Cari tugas atau pasien').fill('second-filter');
 await page.getByRole('button', { name: 'Terapkan filter' }).click();
 await expect(page).toHaveURL(/search=second-filter/);
 await page.goBack();
 await expect(page.getByLabel('Cari tugas atau pasien')).toHaveValue('unmatched-refactor');
});


async function signIn(page: import('@playwright/test').Page, user = 'rina') {
 await page.goto('/login');
 await page.getByLabel('ID petugas').fill(user);
 await page.getByLabel('Kata sandi', { exact: true }).fill('InpaCareDemo!2026');
 await page.getByRole('button', { name: 'Masuk', exact: true }).click();
 await expect(page).not.toHaveURL(/\/login$/);
}

test('calendar keeps an inclusive week and a failed placement form', async ({ page }) => {
 await signIn(page);
 await page.goto('/calendar?from=2026-11-02');
 await expect(page.getByRole('heading', { name: 'Kalender Ruangan', exact: true })).toBeVisible();
 await page.getByRole('button', { name: /Tempatkan pasien/ }).click();
 const form=page.locator('.form-panel form');
 await form.getByRole('combobox', { name: /^Pasien/ }).selectOption({ index: 1 });
 await form.getByRole('combobox', { name: /^Ruangan/ }).selectOption({ index: 1 });
 await form.getByLabel('Tanggal masuk').fill('2026-11-03');
 await form.getByLabel('Tanggal keluar').fill('2026-11-04');
 await page.route('**/api/v1/placements', async route => {
  if (route.request().method() === 'POST') await route.fulfill({status:409,json:{error:{code:'CAPACITY',message:'Kapasitas telah berubah.'}}});
  else await route.continue();
 });
 await form.getByRole('button', { name: /Simpan penempatan/ }).click();
 await expect(page.getByRole('alert')).toContainText('Kapasitas telah berubah.');
 await expect(form.getByLabel('Tanggal masuk')).toHaveValue('2026-11-03');
 await expect(form.getByLabel('Tanggal keluar')).toHaveValue('2026-11-04');
});

test('patient context renders after direct navigation and reload', async ({ page }) => {
 await signIn(page);
 await page.goto('/patients/PT-001');
 await expect(page.getByRole('heading', {name:'Ringkasan Pasien'})).toBeVisible();
 await expect(page.getByRole('heading', {name:'Riwayat Penempatan'})).toBeVisible();
 await page.reload();
 await expect(page.getByRole('heading', {name:'Tim Perawatan'})).toBeVisible();
});


test('a rejected task update preserves the draft and sends a single versioned write', async ({ page }) => {
 await signIn(page,'dina');
 await page.goto('/tasks');
 await page.locator('.task-card').first().getByRole('button').first().click();
 const dialog=page.getByRole('dialog');
 await expect(dialog).toBeVisible();
 await dialog.getByLabel('Catatan tindakan').fill('Draft survives a stale version');
 let writes=0;
 await page.route('**/api/v1/tasks/*',async route=>{
  if(route.request().method()==='PATCH') {
   writes++;
   expect(route.request().postDataJSON().expectedVersion).toEqual(expect.any(Number));
   await route.fulfill({status:409,json:{error:{code:'CONFLICT',message:'Data telah berubah. Muat ulang.'}}});
  } else await route.continue();
 });
 await dialog.getByRole('button',{name:'Simpan catatan'}).click();
 await expect(dialog.getByRole('alert')).toContainText('Data telah berubah.');
 await expect(dialog.getByLabel('Catatan tindakan')).toHaveValue('Draft survives a stale version');
 expect(writes).toBe(1);
});


test('notification read action remains connected through dashboard composition', async ({ page }) => {
 await signIn(page);
 const response=await page.request.get('/api/v1/notifications');
 expect(response.ok()).toBe(true);
 const notices=(await response.json()).items as {id:string;readAt:string|null;message:string}[];
 await page.goto('/dashboard');
 const summary=page.locator('details').filter({has:page.locator('summary').filter({hasText:'Notifikasi'})});
 await summary.locator('summary').click();
 if(notices.some(notice=>!notice.readAt)) {
  const changed=page.waitForResponse(response=>response.request().method()==='POST' && /\/notifications\/[^/]+\/read$/.test(new URL(response.url()).pathname));
  await summary.getByRole('button',{name:'Tandai dibaca'}).first().click();
  expect((await changed).ok()).toBe(true);
 } else {
  await expect(summary).toContainText(notices.length ? notices[0].message : 'Belum ada notifikasi.');
 }
});


test('coordinator reassignment, cancellation and logical deletion preserve reasons and access', async ({ page, browser }) => {
 await signIn(page);
 const reference=await (await page.request.get('/api/v1/reference')).json();
 const placement=reference.placements.find((item: {status:string})=>item.status==='active');
 const dina=reference.staff.find((item: {name:string})=>item.name==='Dina Putri');
 const bima=reference.staff.find((item: {name:string})=>item.name.startsWith('Bima'));
 const csrf=(await page.context().cookies()).find(cookie=>cookie.name==='csrf_token')!.value;
 async function createTask(title:string) {
  const starts=new Date(Date.now()+10*60_000), ends=new Date(starts.getTime()+30*60_000);
  const response=await page.request.post('/api/v1/tasks',{headers:{'x-csrf-token':csrf,origin:new URL(page.url()).origin},data:{patientId:placement.patientId,placementId:placement.id,picId:dina.id,title,priority:'normal',startsAt:starts.toISOString(),endsAt:ends.toISOString()}});
  expect(response.ok()).toBe(true);
  return (await response.json()) as {id:string;title:string};
 }
 const task=await createTask(`Refactor reason ${Date.now()}`);
 await page.goto(`/tasks?search=${encodeURIComponent(task.title)}`);
 await page.locator('.task-card').getByRole('button').first().click();
 const detail=page.getByRole('dialog');
 await detail.getByRole('combobox',{name:/Alihkan ke perawat/}).selectOption(bima.id);
 await detail.getByLabel('Alasan pengalihan').fill('Pergantian shift sintetis');
 await detail.getByRole('button',{name:'Alihkan PIC',exact:true}).click();
 await expect(detail).toContainText(bima.name);
 await expect(detail).toContainText('Pergantian shift sintetis');
 const oldPic=await browser.newPage();
 await signIn(oldPic,'dina');
 expect((await oldPic.request.get(`/api/v1/tasks/${task.id}`)).status()).toBe(404);
 await oldPic.goto(`/tasks?search=${encodeURIComponent(task.title)}`);
 await expect(oldPic.locator('.task-card')).toHaveCount(0);
 await oldPic.close();
 page.on('dialog',async dialog=>dialog.type()==='prompt'?dialog.accept('Alasan sintetis regresi'):dialog.accept());
 const cancelled=page.waitForResponse(response=>response.request().method()==='POST' && new URL(response.url()).pathname===`/api/v1/tasks/${task.id}/move`);
 await detail.getByRole('button',{name:'Batalkan dengan alasan'}).click();
 const cancelDialog=page.getByRole('dialog',{name:new RegExp(`Pindahkan ${task.title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}`)});
 await cancelDialog.getByLabel('Alasan pembatalan').fill('Alasan sintetis regresi');
 await cancelDialog.getByRole('button',{name:'Konfirmasi pindahkan'}).click();
 const cancellation=await cancelled;
 expect(cancellation.ok()).toBe(true);
 expect(cancellation.request().postDataJSON().reason).toBe('Alasan sintetis regresi');
 await page.reload();
 await expect(page.locator('.task-column').filter({has:page.getByText(task.title,{exact:true})})).toContainText('Dibatalkan');
 const removed=await createTask(`Refactor delete ${Date.now()}`);
 await page.goto(`/tasks?search=${encodeURIComponent(removed.title)}`);
 await page.locator('.task-card').getByRole('button').first().click();
 const deleted=page.waitForResponse(response=>response.request().method()==='DELETE' && new URL(response.url()).pathname===`/api/v1/tasks/${removed.id}`);
 await page.getByRole('dialog').getByRole('button',{name:'Hapus logis dengan alasan'}).click();
 const deletion=await deleted;
 expect(deletion.ok()).toBe(true);
 expect(deletion.request().postDataJSON()).toMatchObject({reason:'Alasan sintetis regresi',expectedVersion:expect.any(Number)});
 await expect(page.locator('.task-card')).toHaveCount(0);
});
