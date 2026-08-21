(function (root, factory) {
    const filenameRule = factory();
    if (typeof module === 'object' && module.exports) module.exports = filenameRule;
    root.FilenameRule = filenameRule;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const FILENAME_RULES = Object.freeze(['automatic', 'original', 'custom']);
    const TEMPLATE_VARIABLES = Object.freeze(['originalName', 'date', 'time', 'domain', 'pageTitle', 'width', 'height', 'ext']);
    const DEFAULT_CUSTOM_TEMPLATE = '{originalName}_{date}_{domain}.{ext}';
    const VARIABLE_PATTERN = /\{([^{}]+)\}/g;
    const FORBIDDEN = /[\u0000-\u001f\u007f<>:"/\\|?*]/g;
    const DEVICES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

    function normalizeFilenameRule(value) { return FILENAME_RULES.includes(value) ? value : 'automatic'; }

    function validateTemplate(value) {
        const template = String(value == null ? '' : value).trim();
        if (!template) return { valid: false, error: 'Template cannot be empty.' };
        let variableStart = -1;
        for (let index = 0; index < template.length; index += 1) {
            const character = template[index];
            if (character === '{') {
                if (variableStart !== -1) {
                    return { valid: false, error: 'Template variables cannot be nested.' };
                }
                variableStart = index;
            } else if (character === '}') {
                if (variableStart === -1) {
                    return { valid: false, error: 'Template variable braces must be balanced.' };
                }
                const variable = template.slice(variableStart + 1, index);
                if (!variable.trim()) {
                    return { valid: false, error: 'Template variable cannot be empty.' };
                }
                if (!TEMPLATE_VARIABLES.includes(variable)) {
                    return { valid: false, error: `Unsupported template variable: ${variable}.` };
                }
                variableStart = -1;
            }
        }
        if (variableStart !== -1) {
            return { valid: false, error: 'Template variable braces must be balanced.' };
        }
        return { valid: true, error: '' };
    }

    function parseUrl(value) {
        try { return new URL(String(value)); } catch (_) { return null; }
    }

    function extractOriginalName(imageUrl) {
        const url = parseUrl(imageUrl);
        if (!url) return 'image';
        let segment = url.pathname.split('/').pop() || '';
        try { segment = decodeURIComponent(segment); } catch (_) { return 'image'; }
        segment = segment.replace(/[\\/]/g, '_');
        if (!segment) return 'image';
        const dot = segment.lastIndexOf('.');
        if (dot > 0) segment = segment.slice(0, dot);
        return segment || 'image';
    }

    function extractSourceExtension(imageUrl) {
        const url = parseUrl(imageUrl);
        if (!url) return 'bin';
        const segment = url.pathname.split('/').pop() || '';
        const match = /\.([^.]+)$/.exec(segment);
        return match && /^[a-z0-9]{1,10}$/i.test(match[1]) ? match[1].toLowerCase() : 'bin';
    }

    function normalizeDomain(pageUrl) {
        const url = parseUrl(pageUrl);
        if (!url || !url.hostname) return 'unknown-site';
        return url.hostname.replace(/^www\./i, '') || 'unknown-site';
    }

    function extension(value) {
        const result = String(value || '').trim().toLowerCase().replace(/^\./, '');
        return /^[a-z0-9]{1,10}$/.test(result) ? result : 'bin';
    }

    function toWellFormed(value) {
        const stringValue = String(value);
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

    function utf8Truncate(value, maxBytes) {
        let result = '';
        for (const character of value) {
            const next = result + character;
            if (utf8Bytes(next) > maxBytes) break;
            result = next;
        }
        return result;
    }

    function utf8Bytes(value) {
        if (typeof TextEncoder === 'function') return new TextEncoder().encode(value).length;
        return unescape(encodeURIComponent(value)).length;
    }

    function sanitizeFilename(value, actualExtension, fallbackFilename) {
        const ext = extension(actualExtension);
        let fallback = toWellFormed(fallbackFilename || `image.${ext}`).normalize('NFC').replace(FORBIDDEN, '_').trim().replace(/[ .]+$/g, '');
        if (!fallback) fallback = `image.${ext}`;
        if (!/\.[a-z0-9]{1,10}$/i.test(fallback)) fallback += `.${ext}`;
        let result = toWellFormed(value == null ? '' : value).normalize('NFC').replace(FORBIDDEN, '_').trim().replace(/[ .]+$/g, '');
        if (!result) result = fallback;
        if (DEVICES.test(result)) result = `_${result}`;
        if (!result.toLowerCase().endsWith(`.${ext}`)) result += `.${ext}`;
        const suffix = `.${ext}`;
        const basename = result.slice(0, -suffix.length);
        result = `${utf8Truncate(basename, 255 - utf8Bytes(suffix))}${suffix}`;
        if (result === suffix || !result.slice(0, -suffix.length).trim()) result = `image${suffix}`;
        return result;
    }

    function dateParts(now) {
        const date = now instanceof Date ? now : new Date();
        const pad = (n) => String(n).padStart(2, '0');
        return {
            date: `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`,
            time: `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
        };
    }

    function automaticFilename({ imageUrl, pageUrl, extension: actualExtension, now }) {
        if (!parseUrl(imageUrl) || !parseUrl(pageUrl)) return `image_${now instanceof Date ? now.getTime() : Date.now()}_fallback.${extension(actualExtension)}`;
        const url = parseUrl(pageUrl);
        const host = url ? url.hostname.replace(/\./g, '_') : 'unknown-site';
        const parts = dateParts(now);
        return `image_${parts.date}${parts.time}_${host}.${extension(actualExtension)}`;
    }

    function generateFilename({ rule, template, imageUrl, pageUrl, pageTitle, width, height, extension: actualExtension, now }) {
        const ext = extension(actualExtension || extractSourceExtension(imageUrl));
        const automatic = automaticFilename({ imageUrl, pageUrl, extension: ext, now });
        let rendered;
        const normalizedRule = normalizeFilenameRule(rule);
        if (normalizedRule === 'automatic') rendered = automatic;
        else if (normalizedRule === 'original') rendered = `${extractOriginalName(imageUrl)}.${ext}`;
        else {
            const check = validateTemplate(template == null ? DEFAULT_CUSTOM_TEMPLATE : template);
            if (!check.valid) return sanitizeFilename(automatic, ext, automatic);
            const parts = dateParts(now);
            const values = { originalName: extractOriginalName(imageUrl), ...parts, domain: normalizeDomain(pageUrl), pageTitle: pageTitle == null ? '' : String(pageTitle), width: width == null ? 'unknown' : width, height: height == null ? 'unknown' : height, ext };
            rendered = String(template == null ? DEFAULT_CUSTOM_TEMPLATE : template).trim().replace(VARIABLE_PATTERN, (_, name) => values[name]);
            if (!rendered.replace(FORBIDDEN, '').replace(/[. ]/g, '').trim()) return sanitizeFilename(automatic, ext, automatic);
        }
        return sanitizeFilename(rendered, ext, automatic);
    }

    async function readImageDimensions(blob, createImageBitmapImpl = globalThis.createImageBitmap) {
        let bitmap;
        try {
            if (typeof createImageBitmapImpl !== 'function') throw new Error('unsupported');
            bitmap = await createImageBitmapImpl(blob);
            if (!bitmap || !Number.isFinite(bitmap.width) || !Number.isFinite(bitmap.height) || bitmap.width <= 0 || bitmap.height <= 0) throw new Error('invalid dimensions');
            return { width: bitmap.width, height: bitmap.height };
        } catch (_) {
            return { width: 'unknown', height: 'unknown' };
        } finally {
            if (bitmap && typeof bitmap.close === 'function') {
                try { bitmap.close(); } catch (_) { /* cleanup failures must not escape */ }
            }
        }
    }

    return { FILENAME_RULES, TEMPLATE_VARIABLES, DEFAULT_CUSTOM_TEMPLATE, normalizeFilenameRule, validateTemplate, extractOriginalName, extractSourceExtension, normalizeDomain, readImageDimensions, generateFilename, sanitizeFilename };
}));
