(function (root, factory) {
    const imageFormat = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = imageFormat;
    }

    root.ImageFormat = imageFormat;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const FORMAT_PREFERENCES = Object.freeze(['original', 'ask', 'png', 'jpg', 'webp']);
    const MIME_EXTENSIONS = Object.freeze({
        'image/gif': 'gif',
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp'
    });
    const FORMAT_MIME_TYPES = Object.freeze({
        jpg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp'
    });

    function normalizeFormatPreference(value) {
        return FORMAT_PREFERENCES.includes(value) ? value : 'original';
    }

    function sanitizeExtension(value) {
        const normalized = String(value || '').trim().toLowerCase().replace(/^\./, '');
        return /^[a-z0-9]{1,10}$/.test(normalized) ? normalized : 'bin';
    }

    function extensionForMimeType(mimeType, fallbackExtension = 'bin') {
        return safeImageExtensionForMimeType(mimeType) || sanitizeExtension(fallbackExtension);
    }

    function replaceFilenameExtension(filename, extension) {
        const safeExtension = sanitizeExtension(extension);
        const normalizedFilename = String(filename || 'image');
        const lastSlash = Math.max(normalizedFilename.lastIndexOf('/'), normalizedFilename.lastIndexOf('\\'));
        const lastDot = normalizedFilename.lastIndexOf('.');
        const basename = lastDot > lastSlash ? normalizedFilename.slice(0, lastDot) : normalizedFilename;

        return `${basename}.${safeExtension}`;
    }

    function ascii(bytes, start, length) {
        return String.fromCharCode(...bytes.subarray(start, start + length));
    }

    function readUint32BigEndian(bytes, offset) {
        return ((bytes[offset] << 24) >>> 0) +
            (bytes[offset + 1] << 16) +
            (bytes[offset + 2] << 8) +
            bytes[offset + 3];
    }

    function readUint32LittleEndian(bytes, offset) {
        return bytes[offset] +
            (bytes[offset + 1] << 8) +
            (bytes[offset + 2] << 16) +
            ((bytes[offset + 3] << 24) >>> 0);
    }

    function skipGifSubBlocks(bytes, offset) {
        let position = offset;

        while (position < bytes.length) {
            const blockLength = bytes[position];
            position += 1;

            if (blockLength === 0) return position;
            if (position + blockLength > bytes.length) return -1;
            position += blockLength;
        }

        return -1;
    }

    function isAnimatedGif(bytes) {
        if (bytes.length < 13 || !['GIF87a', 'GIF89a'].includes(ascii(bytes, 0, 6))) return false;

        const globalColorTableSize = (bytes[10] & 0x80) !== 0
            ? 3 * (2 ** ((bytes[10] & 0x07) + 1))
            : 0;
        let position = 13 + globalColorTableSize;
        let frameCount = 0;

        while (position < bytes.length) {
            const marker = bytes[position];

            if (marker === 0x3b) break;

            if (marker === 0x21) {
                if (position + 2 > bytes.length) return false;
                position = skipGifSubBlocks(bytes, position + 2);
                if (position < 0) return false;
                continue;
            }

            if (marker === 0x2c) {
                if (position + 10 > bytes.length) return false;

                frameCount += 1;
                if (frameCount > 1) return true;

                const localColorTableSize = (bytes[position + 9] & 0x80) !== 0
                    ? 3 * (2 ** ((bytes[position + 9] & 0x07) + 1))
                    : 0;
                position += 10 + localColorTableSize;
                if (position >= bytes.length) return false;

                position = skipGifSubBlocks(bytes, position + 1);
                if (position < 0) return false;
                continue;
            }

            return false;
        }

        return false;
    }

    function isAnimatedPng(bytes) {
        const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
        if (bytes.length < 8 || pngSignature.some((value, index) => bytes[index] !== value)) return false;

        let position = 8;
        while (position + 12 <= bytes.length) {
            const chunkLength = readUint32BigEndian(bytes, position);
            const chunkEnd = position + 12 + chunkLength;
            if (chunkEnd > bytes.length) return false;
            if (ascii(bytes, position + 4, 4) === 'acTL') return true;
            position = chunkEnd;
        }

        return false;
    }

    function isAnimatedWebp(bytes) {
        if (bytes.length < 12 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return false;

        let position = 12;
        while (position + 8 <= bytes.length) {
            const chunkType = ascii(bytes, position, 4);
            const chunkLength = readUint32LittleEndian(bytes, position + 4);
            const chunkEnd = position + 8 + chunkLength;
            if (chunkEnd > bytes.length) return false;
            if (chunkType === 'ANIM' || chunkType === 'ANMF') return true;
            position = chunkEnd + (chunkLength % 2);
        }

        return false;
    }

    function isAnimatedImage(input, mimeType) {
        const bytes = input instanceof Uint8Array ? input : new Uint8Array(input || 0);
        const normalizedMimeType = canonicalMimeType(mimeType);

        if (normalizedMimeType === 'image/gif') return isAnimatedGif(bytes);
        if (normalizedMimeType === 'image/png') return isAnimatedPng(bytes);
        if (normalizedMimeType === 'image/webp') return isAnimatedWebp(bytes);
        return false;
    }

    function canonicalMimeType(mimeType) {
        const normalizedMimeType = String(mimeType || '').split(';')[0].trim().toLowerCase();
        return normalizedMimeType === 'image/jpg' ? 'image/jpeg' : normalizedMimeType;
    }

    function safeImageExtensionForMimeType(mimeType) {
        const normalizedMimeType = canonicalMimeType(mimeType);
        if (MIME_EXTENSIONS[normalizedMimeType]) return MIME_EXTENSIONS[normalizedMimeType];
        if (!normalizedMimeType.startsWith('image/')) return '';

        const subtype = normalizedMimeType.slice('image/'.length).split('+')[0];
        return /^[a-z0-9]{1,10}$/.test(subtype) ? subtype : '';
    }

    function detectImageMimeType(bytes, providedMimeType) {
        if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(ascii(bytes, 0, 6))) return 'image/gif';
        if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
            .every((value, index) => bytes[index] === value)) return 'image/png';
        if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'image/webp';
        if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
        return canonicalMimeType(providedMimeType);
    }

    function originalImageResult(blob, filename, mimeType, warningCode = null, warningDetail = '') {
        const resolvedMimeType = mimeType || canonicalMimeType(blob.type) || 'application/octet-stream';
        const extension = safeImageExtensionForMimeType(resolvedMimeType);
        return {
            blob,
            filename: extension ? replaceFilenameExtension(filename, extension) : filename,
            mimeType: resolvedMimeType,
            warningCode,
            warningDetail
        };
    }

    async function prepareImageForUpload({
        blob,
        filename,
        targetFormat,
        createImageBitmapImpl = globalThis.createImageBitmap,
        OffscreenCanvasImpl = globalThis.OffscreenCanvas
    }) {
        const normalizedTarget = normalizeFormatPreference(targetFormat);
        if (normalizedTarget === 'ask') {
            throw new Error('A concrete image format must be selected before preparing the upload.');
        }

        const targetMimeType = FORMAT_MIME_TYPES[normalizedTarget];
        const sourceBytes = new Uint8Array(await blob.arrayBuffer());
        const sourceMimeType = detectImageMimeType(sourceBytes, blob.type);

        if (!targetMimeType || targetMimeType === sourceMimeType) {
            return originalImageResult(blob, filename, sourceMimeType);
        }

        if (isAnimatedImage(sourceBytes, sourceMimeType)) {
            return originalImageResult(blob, filename, sourceMimeType, 'animated-image');
        }

        let bitmap;
        try {
            if (typeof createImageBitmapImpl !== 'function' || typeof OffscreenCanvasImpl !== 'function') {
                throw new Error('Image conversion is not supported by this browser.');
            }

            bitmap = await createImageBitmapImpl(blob);
            const canvas = new OffscreenCanvasImpl(bitmap.width, bitmap.height);
            const context = canvas.getContext('2d');
            if (!context) throw new Error('Could not create a 2D conversion context.');

            if (targetMimeType === 'image/jpeg') {
                context.fillStyle = '#ffffff';
                context.fillRect(0, 0, bitmap.width, bitmap.height);
            }

            context.drawImage(bitmap, 0, 0);
            const convertOptions = targetMimeType === 'image/png'
                ? { type: targetMimeType }
                : { type: targetMimeType, quality: 0.92 };
            const convertedBlob = await canvas.convertToBlob(convertOptions);

            if (!convertedBlob || canonicalMimeType(convertedBlob.type) !== targetMimeType) {
                throw new Error('The browser returned an unexpected image format.');
            }

            return {
                blob: convertedBlob,
                filename: replaceFilenameExtension(filename, extensionForMimeType(targetMimeType)),
                mimeType: targetMimeType,
                warningCode: null,
                warningDetail: ''
            };
        } catch (error) {
            return originalImageResult(blob, filename, sourceMimeType, 'conversion-failed', error.message || String(error));
        } finally {
            bitmap?.close?.();
        }
    }

    return {
        FORMAT_PREFERENCES,
        extensionForMimeType,
        isAnimatedImage,
        normalizeFormatPreference,
        prepareImageForUpload,
        replaceFilenameExtension
    };
}));
