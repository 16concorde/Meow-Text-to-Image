import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
const require=createRequire(import.meta.url);
export async function startBrowserFixture(){
 let runtime;try{runtime=require('playwright');}catch{runtime=require(process.env.MIAO_PLAYWRIGHT_MODULE||`${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`);}
 const server=spawn(process.execPath,['tests/preview-server.mjs'],{env:{...process.env,MIAO_PREVIEW_PORT:'0'},stdio:['ignore','pipe','pipe']});let browser;
 try{const url=await new Promise((resolve,reject)=>{let stderr='';const timer=setTimeout(()=>reject(Error(stderr||'preview timeout')),10000);server.stderr.on('data',data=>stderr+=data);server.stdout.on('data',data=>{const match=String(data).match(/http:\/\/[^\s]+/);if(match){clearTimeout(timer);resolve(match[0]);}});server.on('exit',()=>{clearTimeout(timer);reject(Error(stderr));});});browser=await runtime.chromium.launch({channel:process.env.MIAO_BROWSER_CHANNEL||'chrome',headless:true});return {browser,url,async close(){await browser.close();server.kill();}};}catch(error){await browser?.close();server.kill();throw error;}
}
export async function openFixturePage(browser,url,query='settings-smoke',options={}){const page=await browser.newPage(options);await page.goto(url+'/?'+query);await page.waitForFunction(()=>window.preview?.moduleLoaded);if(query.includes('settings-http='))await page.evaluate(()=>window.preview.completeSettings());await page.locator('#miao-nai-menu').waitFor();return page;}
