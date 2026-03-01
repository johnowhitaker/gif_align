(() => {
  'use strict';

  const QUALITY_PRESETS = {
    draft: { sampleInterval: 20, dither: false, workers: 2 },
    balanced: { sampleInterval: 10, dither: 'FloydSteinberg-serpentine', workers: 2 },
    high: { sampleInterval: 5, dither: 'Stucki-serpentine', workers: 3 },
    ultra: { sampleInterval: 2, dither: 'FloydSteinberg-serpentine', workers: 4 },
  };

  const state = {
    frames: [],
    selectedIndex: -1,
    drag: null,
    renderUrl: null,
    rendering: false,
  };

  const els = {
    dropZone: document.getElementById('dropZone'),
    fileInput: document.getElementById('fileInput'),
    frameCount: document.getElementById('frameCount'),
    clearFramesBtn: document.getElementById('clearFramesBtn'),

    fpsInput: document.getElementById('fpsInput'),
    aspectSelect: document.getElementById('aspectSelect'),
    sizeSelect: document.getElementById('sizeSelect'),
    qualitySelect: document.getElementById('qualitySelect'),
    hdrModeSelect: document.getElementById('hdrModeSelect'),
    toneMapStrength: document.getElementById('toneMapStrength'),
    showReference: document.getElementById('showReference'),
    referenceOpacity: document.getElementById('referenceOpacity'),

    renderGifBtn: document.getElementById('renderGifBtn'),
    renderProgress: document.getElementById('renderProgress'),
    statusText: document.getElementById('statusText'),

    editorCanvas: document.getElementById('editorCanvas'),
    zoomInput: document.getElementById('zoomInput'),
    xOffsetInput: document.getElementById('xOffsetInput'),
    yOffsetInput: document.getElementById('yOffsetInput'),
    copyFirstTransformBtn: document.getElementById('copyFirstTransformBtn'),
    resetTransformBtn: document.getElementById('resetTransformBtn'),

    frameList: document.getElementById('frameList'),
    gifPreview: document.getElementById('gifPreview'),
    downloadLink: document.getElementById('downloadLink'),
  };

  const editorCtx = els.editorCanvas.getContext('2d');

  init();

  function init() {
    bindImportEvents();
    bindControls();
    bindEditorEvents();
    bindFrameListEvents();

    window.addEventListener('resize', renderEditor);
    window.addEventListener('keydown', onKeyNudge);

    updateControlDisabledState();
    updateToneMapControlState();
    renderEditor();
  }

  function bindImportEvents() {
    window.addEventListener('dragover', (event) => {
      event.preventDefault();
    });

    window.addEventListener('drop', (event) => {
      event.preventDefault();
    });

    els.fileInput.addEventListener('change', async (event) => {
      const files = Array.from(event.target.files || []);
      event.target.value = '';
      await addFiles(files);
    });

    els.dropZone.addEventListener('dragenter', () => {
      els.dropZone.classList.add('is-over');
    });

    els.dropZone.addEventListener('dragleave', (event) => {
      if (!els.dropZone.contains(event.relatedTarget)) {
        els.dropZone.classList.remove('is-over');
      }
    });

    els.dropZone.addEventListener('dragover', (event) => {
      event.preventDefault();
      els.dropZone.classList.add('is-over');
    });

    els.dropZone.addEventListener('drop', async (event) => {
      event.preventDefault();
      els.dropZone.classList.remove('is-over');
      const files = Array.from(event.dataTransfer?.files || []);
      await addFiles(files);
    });

    els.clearFramesBtn.addEventListener('click', () => {
      clearFrames();
      renderAll();
      setStatus('Frames cleared.', 'warn');
    });
  }

  function bindControls() {
    els.aspectSelect.addEventListener('change', () => {
      renderEditor();
    });

    els.showReference.addEventListener('change', renderEditor);
    els.referenceOpacity.addEventListener('input', renderEditor);

    els.hdrModeSelect.addEventListener('change', () => {
      updateToneMapControlState();
    });

    els.renderGifBtn.addEventListener('click', () => {
      void renderGif();
    });

    els.zoomInput.addEventListener('input', () => {
      const frame = getSelectedFrame();
      if (!frame) {
        return;
      }
      const parsed = parseFloat(els.zoomInput.value);
      if (!Number.isFinite(parsed)) {
        return;
      }
      frame.zoom = clamp(parsed, 0.2, 8);
      renderEditor();
      renderFrameList();
    });

    els.xOffsetInput.addEventListener('input', () => {
      const frame = getSelectedFrame();
      if (!frame) {
        return;
      }
      const parsed = parseFloat(els.xOffsetInput.value);
      if (!Number.isFinite(parsed)) {
        return;
      }
      frame.offsetX = clamp(parsed / 100, -3, 3);
      renderEditor();
      renderFrameList();
    });

    els.yOffsetInput.addEventListener('input', () => {
      const frame = getSelectedFrame();
      if (!frame) {
        return;
      }
      const parsed = parseFloat(els.yOffsetInput.value);
      if (!Number.isFinite(parsed)) {
        return;
      }
      frame.offsetY = clamp(parsed / 100, -3, 3);
      renderEditor();
      renderFrameList();
    });

    els.copyFirstTransformBtn.addEventListener('click', () => {
      const frame = getSelectedFrame();
      if (!frame || state.frames.length < 1) {
        return;
      }
      const source = state.frames[0];
      frame.zoom = source.zoom;
      frame.offsetX = source.offsetX;
      frame.offsetY = source.offsetY;
      syncTransformInputs();
      renderEditor();
      renderFrameList();
      setStatus('Copied frame 1 transform to selected frame.', 'ok');
    });

    els.resetTransformBtn.addEventListener('click', () => {
      const frame = getSelectedFrame();
      if (!frame) {
        return;
      }
      frame.zoom = 1;
      frame.offsetX = 0;
      frame.offsetY = 0;
      syncTransformInputs();
      renderEditor();
      renderFrameList();
    });
  }

  function bindEditorEvents() {
    els.editorCanvas.addEventListener('pointerdown', (event) => {
      const frame = getSelectedFrame();
      if (!frame || state.rendering) {
        return;
      }

      state.drag = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startOffsetX: frame.offsetX,
        startOffsetY: frame.offsetY,
      };

      els.editorCanvas.classList.add('is-dragging');
      els.editorCanvas.setPointerCapture(event.pointerId);
    });

    els.editorCanvas.addEventListener('pointermove', (event) => {
      if (!state.drag || state.drag.pointerId !== event.pointerId) {
        return;
      }

      const frame = getSelectedFrame();
      if (!frame) {
        return;
      }

      const rect = els.editorCanvas.getBoundingClientRect();
      const deltaX = (event.clientX - state.drag.startClientX) / rect.width;
      const deltaY = (event.clientY - state.drag.startClientY) / rect.height;

      frame.offsetX = clamp(state.drag.startOffsetX + deltaX, -3, 3);
      frame.offsetY = clamp(state.drag.startOffsetY + deltaY, -3, 3);

      syncTransformInputs();
      renderEditor();
      renderFrameList();
    });

    els.editorCanvas.addEventListener('pointerup', stopDrag);
    els.editorCanvas.addEventListener('pointercancel', stopDrag);

    els.editorCanvas.addEventListener(
      'wheel',
      (event) => {
        const frame = getSelectedFrame();
        if (!frame || state.rendering) {
          return;
        }

        event.preventDefault();
        const nextZoom = frame.zoom * Math.exp(-event.deltaY * 0.0015);
        frame.zoom = clamp(nextZoom, 0.2, 8);
        syncTransformInputs();
        renderEditor();
        renderFrameList();
      },
      { passive: false }
    );
  }

  function bindFrameListEvents() {
    els.frameList.addEventListener('click', (event) => {
      const target = event.target.closest('[data-index]');
      if (!target) {
        return;
      }

      const index = parseInt(target.dataset.index, 10);
      if (!Number.isInteger(index)) {
        return;
      }

      state.selectedIndex = index;
      renderAll();
    });
  }

  function stopDrag(event) {
    if (!state.drag || state.drag.pointerId !== event.pointerId) {
      return;
    }

    state.drag = null;
    els.editorCanvas.classList.remove('is-dragging');
    try {
      els.editorCanvas.releasePointerCapture(event.pointerId);
    } catch (_error) {
      // Ignored if pointer capture is already released.
    }
  }

  function onKeyNudge(event) {
    const frame = getSelectedFrame();
    if (!frame || state.rendering) {
      return;
    }

    const activeTag = document.activeElement?.tagName;
    if (activeTag === 'INPUT' || activeTag === 'SELECT' || activeTag === 'TEXTAREA') {
      return;
    }

    const step = event.shiftKey ? 0.012 : 0.004;
    let handled = true;

    switch (event.key) {
      case 'ArrowLeft':
        frame.offsetX -= step;
        break;
      case 'ArrowRight':
        frame.offsetX += step;
        break;
      case 'ArrowUp':
        frame.offsetY -= step;
        break;
      case 'ArrowDown':
        frame.offsetY += step;
        break;
      default:
        handled = false;
        break;
    }

    if (!handled) {
      return;
    }

    event.preventDefault();
    frame.offsetX = clamp(frame.offsetX, -3, 3);
    frame.offsetY = clamp(frame.offsetY, -3, 3);
    syncTransformInputs();
    renderEditor();
    renderFrameList();
  }

  async function addFiles(files) {
    const imageFiles = files.filter((file) => isImageLikeFile(file));
    if (!imageFiles.length) {
      setStatus('No image files found in selection.', 'warn');
      return;
    }

    setStatus(`Loading ${imageFiles.length} image file${imageFiles.length === 1 ? '' : 's'}...`, 'warn');

    const loaded = await Promise.all(
      imageFiles.map(async (file) => {
        try {
          return await makeFrameFromFile(file);
        } catch (error) {
          console.error('Failed to decode image file:', file.name, error);
          return null;
        }
      })
    );

    const successful = loaded.filter(Boolean);
    if (!successful.length) {
      setStatus('No files could be decoded. Try PNG/JPG/WebP/AVIF input.', 'warn');
      return;
    }

    for (const frame of successful) {
      state.frames.push(frame);
    }

    if (state.selectedIndex < 0) {
      state.selectedIndex = 0;
    }

    renderAll();

    if (successful.length !== imageFiles.length) {
      setStatus(
        `Loaded ${successful.length}/${imageFiles.length} files. Unsupported images were skipped.`,
        'warn'
      );
      return;
    }

    setStatus(`Loaded ${successful.length} frame${successful.length === 1 ? '' : 's'}.`, 'ok');
  }

  async function makeFrameFromFile(file) {
    const thumbUrl = URL.createObjectURL(file);
    const decoded = await decodeImage(file, thumbUrl);

    return {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: file.name,
      image: decoded.image,
      width: decoded.width,
      height: decoded.height,
      offsetX: 0,
      offsetY: 0,
      zoom: 1,
      thumbUrl,
    };
  }

  async function decodeImage(file, fallbackUrl) {
    if (typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(file, {
          colorSpaceConversion: 'default',
          premultiplyAlpha: 'default',
        });

        return {
          image: bitmap,
          width: bitmap.width,
          height: bitmap.height,
        };
      } catch (_error) {
        // Fall through to Image() decode.
      }
    }

    const image = await loadImageElement(fallbackUrl);
    return {
      image,
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
  }

  function loadImageElement(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Could not load image: ${src}`));
      image.src = src;
    });
  }

  function clearFrames() {
    for (const frame of state.frames) {
      if (frame.image && typeof frame.image.close === 'function') {
        frame.image.close();
      }

      if (frame.thumbUrl) {
        URL.revokeObjectURL(frame.thumbUrl);
      }
    }

    state.frames = [];
    state.selectedIndex = -1;

    if (state.renderUrl) {
      URL.revokeObjectURL(state.renderUrl);
      state.renderUrl = null;
    }

    els.gifPreview.removeAttribute('src');
    els.downloadLink.hidden = true;
    els.downloadLink.removeAttribute('href');
    els.downloadLink.textContent = 'Download GIF';
  }

  function renderAll() {
    renderFrameList();
    updateControlDisabledState();
    syncTransformInputs();
    renderEditor();
  }

  function renderFrameList() {
    els.frameList.innerHTML = '';

    const total = state.frames.length;
    els.frameCount.textContent = `${total} frame${total === 1 ? '' : 's'} loaded`;

    const fragment = document.createDocumentFragment();

    state.frames.forEach((frame, index) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.index = String(index);
      button.className = 'btn frame-item';
      if (index === state.selectedIndex) {
        button.classList.add('is-selected');
      }

      const nameSafe = sanitizeText(frame.name);
      button.innerHTML =
        `<img src="${frame.thumbUrl}" alt="Frame ${index + 1}" />` +
        `<div class="meta">` +
        `<strong>${index + 1}. ${nameSafe}</strong>` +
        `<span>${frame.width}x${frame.height} | z ${frame.zoom.toFixed(2)} | x ${(frame.offsetX * 100).toFixed(1)}% | y ${(frame.offsetY * 100).toFixed(1)}%</span>` +
        `</div>`;

      item.appendChild(button);
      fragment.appendChild(item);
    });

    els.frameList.appendChild(fragment);
  }

  function renderEditor() {
    const dims = getEditorDimensions();

    if (els.editorCanvas.width !== dims.width || els.editorCanvas.height !== dims.height) {
      els.editorCanvas.width = dims.width;
      els.editorCanvas.height = dims.height;
    }

    drawCheckerboard(editorCtx, dims.width, dims.height);

    const selectedFrame = getSelectedFrame();
    if (!selectedFrame) {
      drawEmptyState(editorCtx, dims.width, dims.height);
      drawFrameGuides(editorCtx, dims.width, dims.height);
      return;
    }

    drawFrame(editorCtx, selectedFrame, dims.width, dims.height);

    if (state.selectedIndex > 0 && els.showReference.checked && state.frames[0]) {
      editorCtx.save();
      editorCtx.globalAlpha = clamp(parseFloat(els.referenceOpacity.value) / 100, 0.05, 0.95);
      drawFrame(editorCtx, state.frames[0], dims.width, dims.height);
      editorCtx.restore();
    }

    drawFrameGuides(editorCtx, dims.width, dims.height);
  }

  function drawEmptyState(ctx, width, height) {
    ctx.save();
    ctx.fillStyle = 'rgba(21, 28, 38, 0.72)';
    ctx.font = `600 ${Math.max(14, Math.round(width * 0.035))}px "IBM Plex Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('Drop images to start', width / 2, height / 2);
    ctx.restore();
  }

  function drawCheckerboard(ctx, width, height) {
    const tile = 20;
    ctx.clearRect(0, 0, width, height);

    for (let y = 0; y < height; y += tile) {
      for (let x = 0; x < width; x += tile) {
        const isEven = (x / tile + y / tile) % 2 === 0;
        ctx.fillStyle = isEven ? '#edf0f5' : '#dce2ea';
        ctx.fillRect(x, y, tile, tile);
      }
    }
  }

  function drawFrame(ctx, frame, width, height) {
    const baseScale = Math.max(width / frame.width, height / frame.height);
    const finalScale = baseScale * frame.zoom;

    const drawWidth = frame.width * finalScale;
    const drawHeight = frame.height * finalScale;

    const x = (width - drawWidth) * 0.5 + frame.offsetX * width;
    const y = (height - drawHeight) * 0.5 + frame.offsetY * height;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(frame.image, x, y, drawWidth, drawHeight);
  }

  function drawFrameGuides(ctx, width, height) {
    ctx.save();

    ctx.strokeStyle = 'rgba(20, 34, 50, 0.82)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

    ctx.strokeStyle = 'rgba(20, 34, 50, 0.25)';
    ctx.setLineDash([7, 7]);

    ctx.beginPath();
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2, height);
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    ctx.restore();
  }

  function syncTransformInputs() {
    const frame = getSelectedFrame();

    if (!frame) {
      els.zoomInput.value = '1';
      els.xOffsetInput.value = '0';
      els.yOffsetInput.value = '0';
      return;
    }

    els.zoomInput.value = frame.zoom.toFixed(2);
    els.xOffsetInput.value = (frame.offsetX * 100).toFixed(1);
    els.yOffsetInput.value = (frame.offsetY * 100).toFixed(1);
  }

  function updateControlDisabledState() {
    const hasFrames = state.frames.length > 0;

    els.renderGifBtn.disabled = !hasFrames || state.rendering;
    els.zoomInput.disabled = !hasFrames || state.rendering;
    els.xOffsetInput.disabled = !hasFrames || state.rendering;
    els.yOffsetInput.disabled = !hasFrames || state.rendering;
    els.copyFirstTransformBtn.disabled = !hasFrames || state.selectedIndex <= 0 || state.rendering;
    els.resetTransformBtn.disabled = !hasFrames || state.rendering;
    els.clearFramesBtn.disabled = !hasFrames || state.rendering;
  }

  function updateToneMapControlState() {
    const isToneMap = els.hdrModeSelect.value === 'tonemap';
    els.toneMapStrength.disabled = !isToneMap;
  }

  function getSelectedFrame() {
    if (state.selectedIndex < 0 || state.selectedIndex >= state.frames.length) {
      return null;
    }

    return state.frames[state.selectedIndex];
  }

  function getAspectRatio() {
    const value = els.aspectSelect.value || '1:1';
    const parts = value.split(':').map((entry) => parseFloat(entry));
    const width = Number.isFinite(parts[0]) && parts[0] > 0 ? parts[0] : 1;
    const height = Number.isFinite(parts[1]) && parts[1] > 0 ? parts[1] : 1;
    return { width, height };
  }

  function getEditorDimensions() {
    const ratio = getAspectRatio();
    const container = els.editorCanvas.parentElement;
    const availableWidth = Math.max(260, Math.floor((container?.clientWidth || 680) - 6));
    const longEdge = Math.min(760, availableWidth);
    return scaleToFitLongEdge(ratio.width, ratio.height, longEdge);
  }

  function getOutputDimensions() {
    const ratio = getAspectRatio();
    const longEdge = clamp(parseInt(els.sizeSelect.value, 10), 128, 4000);
    return scaleToFitLongEdge(ratio.width, ratio.height, longEdge);
  }

  function scaleToFitLongEdge(width, height, longEdge) {
    if (width >= height) {
      return {
        width: longEdge,
        height: Math.max(1, Math.round((longEdge * height) / width)),
      };
    }

    return {
      width: Math.max(1, Math.round((longEdge * width) / height)),
      height: longEdge,
    };
  }

  async function renderGif() {
    if (state.rendering || !state.frames.length) {
      return;
    }

    if (typeof window.GIF !== 'function') {
      setStatus('GIF encoder failed to load (missing vendor/gif.js).', 'warn');
      return;
    }

    const fps = clamp(parseInt(els.fpsInput.value, 10) || 8, 1, 60);
    const delay = Math.max(20, Math.round(1000 / fps));
    const output = getOutputDimensions();
    const preset = QUALITY_PRESETS[els.qualitySelect.value] || QUALITY_PRESETS.balanced;
    const shouldToneMap = els.hdrModeSelect.value === 'tonemap';
    const toneStrength = clamp(parseFloat(els.toneMapStrength.value) || 1.2, 0.5, 2.5);

    state.rendering = true;
    updateControlDisabledState();

    els.renderProgress.hidden = false;
    els.renderProgress.value = 0;

    setStatus(
      `Rendering ${state.frames.length} frame${state.frames.length === 1 ? '' : 's'} (${output.width}x${output.height})...`,
      'warn'
    );

    const workerCount = Math.max(2, Math.min(preset.workers, navigator.hardwareConcurrency || preset.workers));

    const gif = new GIF({
      workers: workerCount,
      quality: preset.sampleInterval,
      dither: preset.dither,
      width: output.width,
      height: output.height,
      workerScript: './vendor/gif.worker.js',
    });

    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = output.width;
    frameCanvas.height = output.height;

    const frameCtx = frameCanvas.getContext('2d', {
      willReadFrequently: shouldToneMap,
    });

    if (!frameCtx) {
      state.rendering = false;
      updateControlDisabledState();
      els.renderProgress.hidden = true;
      setStatus('Canvas context could not be created.', 'warn');
      return;
    }

    gif.on('progress', (progress) => {
      const pct = clamp(Math.round(progress * 100), 0, 100);
      els.renderProgress.value = pct;
      setStatus(`Encoding GIF: ${pct}%`, 'warn');
    });

    gif.on('finished', (blob) => {
      if (state.renderUrl) {
        URL.revokeObjectURL(state.renderUrl);
      }

      state.renderUrl = URL.createObjectURL(blob);

      els.gifPreview.src = state.renderUrl;
      els.downloadLink.href = state.renderUrl;
      els.downloadLink.hidden = false;
      els.downloadLink.textContent = `Download GIF (${formatFileSize(blob.size)})`;

      state.rendering = false;
      updateControlDisabledState();
      els.renderProgress.hidden = true;

      setStatus(
        `Done: ${state.frames.length} frames at ${fps} FPS. Use the download button below.`,
        'ok'
      );
    });

    for (const frame of state.frames) {
      frameCtx.clearRect(0, 0, output.width, output.height);
      drawFrame(frameCtx, frame, output.width, output.height);

      if (shouldToneMap) {
        toneMapCanvas(frameCtx, output.width, output.height, toneStrength);
      }

      gif.addFrame(frameCtx, {
        copy: true,
        delay,
      });
    }

    gif.render();
  }

  function toneMapCanvas(ctx, width, height, strength) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const pixels = imageData.data;

    const exposure = 1 + (strength - 1) * 0.9;
    const contrast = 1 + (strength - 1) * 0.08;

    for (let i = 0; i < pixels.length; i += 4) {
      const alpha = pixels[i + 3];
      if (alpha === 0) {
        continue;
      }

      let r = srgbToLinear(pixels[i] / 255) * exposure;
      let g = srgbToLinear(pixels[i + 1] / 255) * exposure;
      let b = srgbToLinear(pixels[i + 2] / 255) * exposure;

      r = acesFilm(r);
      g = acesFilm(g);
      b = acesFilm(b);

      r = Math.pow(clamp(r, 0, 1), 1 / contrast);
      g = Math.pow(clamp(g, 0, 1), 1 / contrast);
      b = Math.pow(clamp(b, 0, 1), 1 / contrast);

      pixels[i] = Math.round(clamp(linearToSrgb(r), 0, 1) * 255);
      pixels[i + 1] = Math.round(clamp(linearToSrgb(g), 0, 1) * 255);
      pixels[i + 2] = Math.round(clamp(linearToSrgb(b), 0, 1) * 255);
    }

    ctx.putImageData(imageData, 0, 0);
  }

  function acesFilm(x) {
    const a = 2.51;
    const b = 0.03;
    const c = 2.43;
    const d = 0.59;
    const e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0, 1);
  }

  function srgbToLinear(value) {
    if (value <= 0.04045) {
      return value / 12.92;
    }
    return Math.pow((value + 0.055) / 1.055, 2.4);
  }

  function linearToSrgb(value) {
    if (value <= 0.0031308) {
      return value * 12.92;
    }
    return 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
  }

  function setStatus(text, tone = 'neutral') {
    els.statusText.textContent = text;

    if (tone === 'ok') {
      els.statusText.style.color = 'var(--ok)';
      return;
    }

    if (tone === 'warn') {
      els.statusText.style.color = 'var(--warn)';
      return;
    }

    els.statusText.style.color = 'var(--muted)';
  }

  function isImageLikeFile(file) {
    if (file.type && file.type.startsWith('image/')) {
      return true;
    }

    return /\.(png|jpe?g|webp|gif|avif|heic|heif|bmp|tiff?)$/i.test(file.name);
  }

  function formatFileSize(bytes) {
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) {
      return `${mb.toFixed(2)} MB`;
    }
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  function sanitizeText(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function clamp(value, min, max) {
    if (!Number.isFinite(value)) {
      return min;
    }
    if (value < min) {
      return min;
    }
    if (value > max) {
      return max;
    }
    return value;
  }
})();
