import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {mergeRegexRules,bundledWorldTargets,WORLD_NAME} from '../src/resources/resources.js';

test('legacy world names remain discoverable for read-only prompt migration',()=>{
    assert.deepEqual(bundledWorldTargets([],''),[WORLD_NAME]);
    assert.deepEqual(bundledWorldTargets(['其他书','[喵喵]文生图 2.0'],'其他书'),['[喵喵]文生图 2.0']);
    assert.deepEqual(bundledWorldTargets(['[喵喵]文生图 2.0',WORLD_NAME],WORLD_NAME),[WORLD_NAME,'[喵喵]文生图 2.0']);
    assert.deepEqual(bundledWorldTargets(['自定义 2.0','[喵喵]文生图 2.9'],''),[WORLD_NAME]);
});

test('regex overwrites old dated copies even with changed IDs and removes duplicates',()=>{
    const old=[{id:'unrelated',scriptName:'用户规则',findRegex:'x',replaceString:'keep'},{id:'imported-id',scriptName:'喵喵文生图1-去标签-0820',findRegex:'old',replaceString:'old'},{id:'copy-id',scriptName:'喵喵文生图1-去标签-1024',findRegex:'copy',replaceString:'copy'},{id:'other',scriptName:'用户规则-0820',findRegex:'y',replaceString:'keep'}];
    const incoming=[{id:'author-id',scriptName:'喵喵文生图1-去标签-1024',findRegex:'new',replaceString:'',disabled:false}];
    const result=mergeRegexRules(old,incoming);
    assert.equal(result.length,3);assert.equal(result[1].id,'imported-id');assert.equal(result[1].findRegex,'new');assert.equal(result[1].scriptName,incoming[0].scriptName);
    assert.deepEqual(result[0],old[0]);assert.deepEqual(result[2],old[3]);assert.deepEqual(mergeRegexRules(result,incoming),result);
    assert.equal(old[1].findRegex,'old');
});
test('regex also replaces by ID or exact name, without conflating unrelated dated rules',()=>{
    const byId=mergeRegexRules([{id:'same',scriptName:'renamed',findRegex:'old',replaceString:''}],{id:'same',scriptName:'新版',findRegex:'new',replaceString:'ok'});
    assert.equal(byId.length,1);assert.equal(byId[0].findRegex,'new');
    const byName=mergeRegexRules([{id:'keep-id',scriptName:'标题',findRegex:'old',replaceString:''}],{id:'other-id',scriptName:'标题',findRegex:'new',replaceString:''});
    assert.equal(byName.length,1);assert.equal(byName[0].id,'keep-id');
    const dated=mergeRegexRules([{id:'old',scriptName:'其他规则-0820',findRegex:'old',replaceString:''}],{scriptName:'其他规则-1024',findRegex:'new',replaceString:''},()=> 'new-id');
    assert.equal(dated.length,2);assert.equal(dated[1].id,'new-id');
    assert.throws(()=>mergeRegexRules([], [{findRegex:'x',replaceString:''},{findRegex:'y'}]),/正则/);
});
test('legacy discovery covers old minor and patch versions without selecting newer books',()=>{
    const current='[喵喵]文生图 2.2.2',old=['[喵喵]文生图 2.0','[喵喵]文生图 2.1','[喵喵]文生图 2.2','[喵喵]文生图 2.2.0','[喵喵]文生图 2.2.1'];
    const names=[...old,current,'[喵喵]文生图 2.2.3','[喵喵]文生图 2.2.10','[喵喵]文生图 2.3','用户书 2.2'];
    assert.deepEqual(bundledWorldTargets(names,old[2],current),[old[2],old[0],old[1],old[3],old[4],current]);
    assert.deepEqual(bundledWorldTargets(names,current,current),[current,...old]);

});

test('bundled pack is exactly world 2.2.2 and the four supplied regex versions',async()=>{
    const book=JSON.parse(await readFile(new URL('../assets/worldbook.json',import.meta.url),'utf8'));
    const rules=JSON.parse(await readFile(new URL('../assets/regex.json',import.meta.url),'utf8'));
    assert.equal(Object.keys(book.entries).length,13);
    assert.ok(book.entries[10].content.includes('easter_egg'));
    assert.deepEqual(rules.map(rule=>rule.scriptName),['喵喵文生图1-去标签-1024','喵喵文生图2-去imagethink-1024','喵喵文生图3-居中美化-0511','喵喵文生图4-彩蛋介绍美化-1024']);
    assert.equal(mergeRegexRules(mergeRegexRules([],rules),rules).length,4);
});
