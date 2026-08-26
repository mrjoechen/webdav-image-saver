(function (root, factory) {
    const imageDiscovery = factory();
    if (typeof module === 'object' && module.exports) module.exports = imageDiscovery;
    root.ImageDiscovery = imageDiscovery;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    function normalizeUrl(value, baseUrl) {
        try {
            const rawValue = String(value || '').trim();
            if (!rawValue) return '';
            const url = new URL(rawValue, baseUrl);
            if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
            url.hash = '';
            return url.href;
        } catch (_) {
            return '';
        }
    }

    function parseSrcset(value, baseUrl) {
        return String(value || '')
            .split(',')
            .map((part, order) => {
                const tokens = part.trim().split(/\s+/).filter(Boolean);
                const url = normalizeUrl(tokens.shift(), baseUrl);
                if (!url || tokens.length > 1) return null;

                const descriptor = tokens[0] || '';
                const width = /^\d+w$/.test(descriptor) ? Number.parseInt(descriptor, 10) : 0;
                const density = /^\d+(?:\.\d+)?x$/.test(descriptor)
                    ? Number.parseFloat(descriptor)
                    : descriptor ? 0 : 1;

                if ((descriptor && width <= 0 && density <= 0) || width < 0 || density < 0) return null;
                return { url, width, density, order };
            })
            .filter(Boolean);
    }

    function selectBestCandidate(record = {}, baseUrl) {
        const responsive = (Array.isArray(record.srcsets) ? record.srcsets : [])
            .flatMap(value => parseSrcset(value, baseUrl));
        const widths = responsive
            .filter(candidate => candidate.width > 0)
            .sort((left, right) => right.width - left.width || left.order - right.order);
        if (widths[0]) {
            return {
                url: widths[0].url,
                descriptorType: 'width',
                descriptorValue: widths[0].width
            };
        }

        const densities = responsive
            .filter(candidate => candidate.density > 0)
            .sort((left, right) => right.density - left.density || left.order - right.order);
        if (densities[0]) {
            return {
                url: densities[0].url,
                descriptorType: 'density',
                descriptorValue: densities[0].density
            };
        }

        const currentSrc = normalizeUrl(record.currentSrc, baseUrl);
        if (currentSrc) return { url: currentSrc, descriptorType: 'current', descriptorValue: 0 };

        const fallbacks = [record.src, ...(Array.isArray(record.lazyUrls) ? record.lazyUrls : [])];
        for (const value of fallbacks) {
            const url = normalizeUrl(value, baseUrl);
            if (url) return { url, descriptorType: 'fallback', descriptorValue: 0 };
        }
        return null;
    }

    function displayName(urlValue) {
        try {
            const segment = new URL(urlValue).pathname.split('/').pop() || 'image';
            return decodeURIComponent(segment) || 'image';
        } catch (_) {
            return 'image';
        }
    }

    function discoverImages(records, baseUrl) {
        const seen = new Set();
        const source = Array.isArray(records) ? [...records] : [];
        return source
            .sort((left, right) => Number(left.domIndex) - Number(right.domIndex))
            .flatMap(record => {
                const selected = selectBestCandidate(record, baseUrl);
                if (!selected || seen.has(selected.url)) return [];
                seen.add(selected.url);

                const domIndex = Number.isInteger(record.domIndex) ? record.domIndex : 0;
                return [{
                    id: `image-${domIndex}`,
                    url: selected.url,
                    name: displayName(selected.url),
                    width: Number(record.naturalWidth) || 0,
                    height: Number(record.naturalHeight) || 0,
                    alt: String(record.alt || ''),
                    domIndex
                }];
            });
    }

    function attribute(element, name) {
        if (!element) return '';
        if (typeof element.getAttribute === 'function') return element.getAttribute(name) || '';
        return element[name] || '';
    }

    function supportedPictureType(value) {
        const type = String(value || '').trim().toLowerCase();
        return !type || [
            'image/avif',
            'image/webp',
            'image/jpeg',
            'image/png',
            'image/gif'
        ].includes(type);
    }

    function activePictureSrcset(image, baseUrl, matchMediaImpl) {
        const picture = image?.parentElement?.tagName === 'PICTURE' ? image.parentElement : null;
        if (!picture || typeof picture.querySelectorAll !== 'function') return '';
        const sources = [...picture.querySelectorAll('source[srcset]')];
        const currentSrc = normalizeUrl(image.currentSrc, baseUrl);
        const currentSource = currentSrc && sources.find(source => (
            parseSrcset(attribute(source, 'srcset'), baseUrl)
                .some(candidate => candidate.url === currentSrc)
        ));
        if (currentSource) return attribute(currentSource, 'srcset');

        const activeSource = sources.find(source => {
            const media = attribute(source, 'media');
            const mediaMatches = !media || matchMediaImpl(media).matches;
            return mediaMatches && supportedPictureType(attribute(source, 'type'));
        });
        return attribute(activeSource, 'srcset');
    }

    function collectImageRecords(documentLike, matchMediaImpl = query => ({ matches: !query })) {
        const baseUrl = documentLike?.baseURI || '';
        return [...(documentLike?.images || [])].map((image, domIndex) => {
            const srcsets = [
                activePictureSrcset(image, baseUrl, matchMediaImpl),
                attribute(image, 'srcset'),
                attribute(image, 'data-srcset')
            ].filter(Boolean);
            const lazyUrls = ['data-src', 'data-original', 'data-lazy-src']
                .map(name => attribute(image, name))
                .filter(Boolean);
            return {
                currentSrc: String(image.currentSrc || ''),
                src: attribute(image, 'src'),
                srcsets,
                lazyUrls,
                naturalWidth: Number(image.naturalWidth) || 0,
                naturalHeight: Number(image.naturalHeight) || 0,
                alt: String(image.alt || ''),
                domIndex
            };
        });
    }

    return {
        normalizeUrl,
        parseSrcset,
        selectBestCandidate,
        discoverImages,
        collectImageRecords
    };
}));
