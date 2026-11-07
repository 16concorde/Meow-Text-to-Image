// Rebuild only pre-baseline configurations. No old text or toggle mapping is active.
export function rebuildLegacyTreeSettings(config, defaults, validate) {
    let next = defaults;
    const retain = patch => {
        const candidate = {...next, ...patch};
        try { validate(candidate); next = candidate; } catch { /* Invalid legacy fields use defaults. */ }
    };
    retain({mode:config.mode});
    retain({tagMode:config.tagMode});
    const params = config.version === 1 ? {count:config.fixed?.张数, eggMarker:config.fixed?.彩蛋标签 ?? config.fixed?.彩蛋位置} : config.params;
    retain({params:{...next.params, count:params?.count}});
    // Validate the marker and protocol together: either may conflict with the other.
    const capture = config.capture == null ? next.capture : {start:config.capture.start, end:config.capture.end};
    retain({params:{...next.params, eggMarker:params?.eggMarker ?? next.params.eggMarker}, capture});
    retain({injection:{depth:config.injection?.depth}});
    // One passive, recoverable snapshot, never a chain of nested migration copies.
    next.migrationArchive = structuredClone(config.migrationArchive ?? config);
    return next;
}
