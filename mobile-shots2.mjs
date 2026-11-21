import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:29229');
const page = await (b.contexts()[0] ?? await b.newContext()).newPage();
await page.setViewportSize({width:390,height:844});
const pages = ['admin','passes','intake-review','attendance','admin/documents','bulletin/ride-share','grievances'];
for (const p of pages) {
  try {
    await page.goto('https://soberliving.vercel.app/'+p, {waitUntil:'domcontentloaded', timeout:45000});
    await page.waitForTimeout(3000);
    await page.screenshot({path:'/tmp/m2-'+p.replace(/\//g,'_')+'.png'});
    console.log(p,'ok',page.url());
  } catch(e){ console.log(p,'ERR',e.message.slice(0,60)); }
}
// resident profile: first resident link
await page.goto('https://soberliving.vercel.app/residents',{waitUntil:'domcontentloaded',timeout:45000});
await page.waitForTimeout(3000);
const link = await page.$$('a[href*="residents/"]');
if(link.length){ await link[0].click(); await page.waitForTimeout(3500); await page.screenshot({path:'/tmp/m2-resident-profile.png'}); console.log('profile',page.url()); }
