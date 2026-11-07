// Literal, deterministic matching. Never scan assembled prompts or recurse.
export const legacyNsfwKeywords = Object.freeze(['NSFW','色情','色色','肉棒','小逼','牛子','操','做爱','上床','喘息']);
// Default list transcribed from the supplied reference image.
export const defaultNsfwKeywords = Object.freeze(["做爱", "上床", "插入", "口交", "内射", "高潮", "前戏", "自慰", "勃起", "脱光", "含住", "骑上", "湿了", "硬了", "瑟瑟", "涩涩", "色色", "nsfw", "鸡巴", "小穴", "阴道", "小逼", "尿", "阴蒂", "淫水", "爱液", "后穴", "精液", "阴唇", "子宫", "宫口", "屁眼", "G点", "阴茎", "肉棒", "性爱", "缠结", "圆房", "行房", "性交", "肉便器", "操弄", "泄欲", "花穴", "奸"]);
export function validateNsfwKeywords(keywords) {
    if (!Array.isArray(keywords) || keywords.length > 64) throw Error('触发关键词需为最多 64 个标签的列表');
    const seen = new Set();
    for (const word of keywords) {
        if (typeof word !== 'string' || !word.trim() || [...word].length > 64 || /[\r\n\u0000-\u001f\u007f]/.test(word)) throw Error('每个标签需为 1～64 个字符的单行文本');
        const key = word.trim().toLowerCase();
        if (seen.has(key)) throw Error('触发关键词重复（不区分大小写）');
        seen.add(key);
    }
    return keywords;
}
export function matchNsfwKeywords(text, keywords) {
    validateNsfwKeywords(keywords);
    const folded = String(text || '').toLowerCase();
    return keywords.some(word => folded.includes(word.trim().toLowerCase()));
}
export function getNsfwActivationText(chat, generationType = 'normal') {
    if (!Array.isArray(chat)) return '';
    let messages = chat;
    // ST removes regenerate's tail after AFTER_COMMANDS; swipe keeps its old tail
    // in chat but excludes it from coreChat. Continue keeps its current reply.
    const tail = messages.at(-1);
    if (['regenerate','swipe'].includes(generationType) && tail && !tail.is_user && !tail.is_system) messages = messages.slice(0,-1);
    return messages.filter(m => m && !m.is_system && !m.extra?.isSmallSys && !m.extra?.miao_display_only && typeof m.mes === 'string' && m.mes.trim()).slice(-2).map(m => m.mes).join('\n');
}
