import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:29229');
const page = await (b.contexts()[0] ?? await b.newContext()).newPage();
await page.setViewportSize({width:390,height:844});
await page.goto('https://soberliving.vercel.app/login', {waitUntil:'domcontentloaded', timeout:60000});
await page.waitForTimeout(2000);
await page.fill('input[type="email"]','arborstarjax+qahouse@gmail.com');
await page.fill('input[type="password"]','QAHouse!Test2026');
await page.click('button[type="submit"]');
await page.waitForTimeout(8000);
console.log('after login at', page.url());
const pages = ['dashboard','residents','chores','payments','meetings','houses','manifest','ua','discipline','leave-requests','bulletin','admin/workspace','notifications','check-ins'];
for (const p of pages) {
  try {
    await page.goto('https://soberliving.vercel.app/'+p, {waitUntil:'domcontentloaded', timeout:45000});
    await page.waitForTimeout(3500);
    await page.screenshot({path:'/tmp/m-'+p.replace(/\//g,'_')+'.png', fullPage:false});
    console.log(p,'ok');
  } catch(e){ console.log(p,'ERR',e.message.slice(0,80)); }
}
