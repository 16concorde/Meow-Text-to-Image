import {defaultLegacyPromptSettings} from './legacy-prompt-settings.js';
import {defaultPromptSettings} from '../../src/prompts/prompt-settings.js';

// Synthetic historical configurations only; no saved host/user settings are read.
export function configurePromptTreeFixture({settings,preview}) {
    const variant=new URL(location.href).searchParams.get('prompt-v1');
    if(!variant)return;
    const saved=sessionStorage.getItem('miao-preview-prompt-state');
    let config=defaultLegacyPromptSettings(variant==='external'?'external':'builtin');
    config.fixed.人格='V1_FIXTURE';config.fixed.彩蛋标签='/fixture_marker';config.orientation='bl';
    if(variant==='custom')config.overrides={main:'V1_CUSTOM_WHOLE_BODY {{user}}'};
    if(variant.startsWith('tree-old')){
        config=defaultPromptSettings();delete config.treeRevision;config.params.persona='V1_FIXTURE';config.enabledById['output.subtitle']=true;config.enabledById['tags.rules']=true;config.enabledById['selfcheck.nsfw']=false;
        config.textOverridesById={'tags.rules':{body:'OLD_CUSTOM_TAGS'},egg:{suffix:'OLD_CUSTOM_END'}};
    }
    settings.promptConfig=saved?JSON.parse(saved):config;
    preview.originalPromptConfig=structuredClone(config);
    preview.promptMigrationFixture=true;
    if(variant==='save-fail'||variant==='tree-old-fail')preview.failSettingsSave=true;
}
