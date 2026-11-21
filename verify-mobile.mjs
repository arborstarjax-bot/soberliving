import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:29229');
const page = await (b.contexts()[0] ?? await b.newContext()).newPage();
await page.setViewportSize({width:390,height:844});
for (const p of ['admin/workspace','chores']) {
  await page.goto('https://soberliving.vercel.app/'+p, {waitUntil:'domcontentloaded', timeout:45000});
  await page.waitForTimeout(3500);
  await page.screenshot({path:'/tmp/v-'+p.replace(/\//g,'_')+'.png'});
  console.log(p,'ok');
}
process.exit(0);
