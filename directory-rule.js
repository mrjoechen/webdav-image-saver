(function (root, factory) {
    const directoryRule = factory();
    if (typeof module === 'object' && module.exports) module.exports = directoryRule;
    root.DirectoryRule = directoryRule;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const DIRECTORY_RULES = Object.freeze(['fixed', 'date', 'domain', 'domain-date']);
    const FORBIDDEN = /[\u0000-\u001f\u007f<>:"/\\|?*]/g;

    function normalizeDirectoryRule(value) {
        return DIRECTORY_RULES.includes(value) ? value : 'fixed';
    }

    function normalizeFolder(folder) {
        let value = String(folder == null ? '' : folder).trim();
        value = value.replace(/\/+/g, '/');
        if (!value || value === '/') return '/';
        if (!value.startsWith('/')) value = `/${value}`;
        return value.replace(/\/+$/, '') || '/';
    }

    function toWellFormed(value) {
        const stringValue = String(value == null ? '' : value);
        if (typeof stringValue.toWellFormed === 'function') return stringValue.toWellFormed();
        let result = '';
        for (let index = 0; index < stringValue.length; index += 1) {
            const code = stringValue.charCodeAt(index);
            if (code >= 0xd800 && code <= 0xdbff) {
                const next = stringValue.charCodeAt(index + 1);
                if (next >= 0xdc00 && next <= 0xdfff) {
                    result += stringValue[index] + stringValue[index + 1];
                    index += 1;
                } else result += '\uFFFD';
            } else if (code >= 0xdc00 && code <= 0xdfff) result += '\uFFFD';
            else result += stringValue[index];
        }
        return result;
    }

    function sanitizeDirectorySegment(value, fallback) {
        const safeFallback = toWellFormed(fallback == null ? 'unknown-site' : fallback)
            .normalize('NFC').replace(FORBIDDEN, '_').trim().replace(/[. ]+$/g, '') || 'unknown-site';
        let result = toWellFormed(value).normalize('NFC').replace(FORBIDDEN, '_').trim().replace(/[. ]+$/g, '');
        if (!result || result === '.' || result === '..') result = safeFallback;
        return result;
    }

    function joinFolder(rootFolder, segments) {
        const root = normalizeFolder(rootFolder);
        if (!segments.length) return root;
        return `${root === '/' ? '' : root}/${segments.join('/')}`;
    }

    function domainSegment(pageUrl) {
        try {
            const url = new URL(String(pageUrl));
            if (!url.hostname) return 'unknown-site';
            return sanitizeDirectorySegment(url.hostname.replace(/^www\./i, ''), 'unknown-site');
        } catch (_) {
            return 'unknown-site';
        }
    }

    function dateSegments(now) {
        if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError('A valid upload date is required.');
        const date = now;
        return [String(date.getFullYear()), String(date.getMonth() + 1).padStart(2, '0')];
    }

    function resolveDirectory({ rule, rootFolder, pageUrl, now = new Date() } = {}) {
        const normalizedRule = normalizeDirectoryRule(rule);
        const root = normalizeFolder(rootFolder);
        if (normalizedRule === 'fixed') return { folder: root, foldersToCreate: [] };
        const dynamic = [];
        if (normalizedRule === 'domain' || normalizedRule === 'domain-date') dynamic.push(domainSegment(pageUrl));
        if (normalizedRule === 'date' || normalizedRule === 'domain-date') dynamic.push(...dateSegments(now));
        const foldersToCreate = dynamic.map((_, index) => joinFolder(root, dynamic.slice(0, index + 1)));
        return { folder: joinFolder(root, dynamic), foldersToCreate };
    }

    return { DIRECTORY_RULES, normalizeDirectoryRule, normalizeFolder, sanitizeDirectorySegment, resolveDirectory };
}));
