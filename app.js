(() => {
  const $ = (id) => document.getElementById(id);
  const els = {
    content: $('content'), charCount: $('charCount'),
    size: $('size'), sizeValue: $('sizeValue'),
    margin: $('margin'), marginValue: $('marginValue'),
    ecLevel: $('ecLevel'),
    fgColor: $('fgColor'), bgColor: $('bgColor'),
    swapColors: $('swapColors'), resetColors: $('resetColors'),
    eyeColor: $('eyeColor'), syncEyeColor: $('syncEyeColor'),
    canvas: $('qrCanvas'), emptyState: $('emptyState'),
    downloadPng: $('downloadPng'), downloadSvg: $('downloadSvg'), copyImage: $('copyImage'),
    themeToggle: $('themeToggle'), toast: $('toast'),
    presets: document.querySelectorAll('.preset'),
    moduleShapeGroup: $('moduleShapeGroup'),
    eyeShapeGroup: $('eyeShapeGroup'),
    logoDropzone: $('logoDropzone'), logoFile: $('logoFile'),
    logoEmpty: $('logoEmpty'), logoFilled: $('logoFilled'),
    logoPreview: $('logoPreview'), logoName: $('logoName'),
    logoRemove: $('logoRemove'),
    logoControls: $('logoControls'),
    logoSize: $('logoSize'), logoSizeValue: $('logoSizeValue'),
    logoBackdrop: $('logoBackdrop'),
    logoWarning: $('logoWarning'),
    labelText: $('labelText'),
    labelSize: $('labelSize'), labelSizeValue: $('labelSizeValue'),
    labelColor: $('labelColor'), labelBold: $('labelBold'),
    tabs: document.querySelectorAll('.tab'),
    tabPanels: document.querySelectorAll('.tab-panel'),
  };

  const DEFAULTS = { fg: '#0f172a', bg: '#ffffff' };
  const LABEL_SIZE_NAMES = { 2: 'XS', 3: 'Small', 4: 'Medium', 5: 'Large', 6: 'XL' };

  const state = {
    moduleShape: 'square',
    eyeShape: 'square',
    eyeColorSync: true,
    logoImage: null,
    logoDataUrl: null,
    logoName: '',
    lastSvg: '',
    lastValid: false,
  };

  // UTILITIES =====================================================
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  const showToast = (msg) => {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => els.toast.classList.remove('show'), 2000);
  };

  const setOutputsEnabled = (enabled) => {
    els.downloadPng.disabled = !enabled;
    els.downloadSvg.disabled = !enabled;
    els.copyImage.disabled = !enabled || !navigator.clipboard || !window.ClipboardItem;
    state.lastValid = enabled;
  };

  const safeFilename = (text) => {
    const cleaned = text.replace(/^https?:\/\//i, '').replace(/[^a-z0-9\-_.]+/gi, '-').slice(0, 40);
    return (cleaned || 'qr-code').replace(/^-+|-+$/g, '') || 'qr-code';
  };

  const isEyeModule = (r, c, count) =>
    (r < 7 && c < 7) ||
    (r < 7 && c >= count - 7) ||
    (r >= count - 7 && c < 7);

  const escapeXml = (s) => s.replace(/[<>&"']/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[ch]));

  // SHAPE RENDERERS — CANVAS ======================================
  const drawModuleCanvas = (ctx, x, y, size, shape) => {
    switch (shape) {
      case 'dots': {
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, size * 0.45, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'rounded': {
        const r = size * 0.3;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, size, size, r);
        else roundRectPath(ctx, x, y, size, size, r);
        ctx.fill();
        break;
      }
      case 'classy': {
        const r = size * 0.12;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, size, size, r);
        else roundRectPath(ctx, x, y, size, size, r);
        ctx.fill();
        break;
      }
      default: ctx.fillRect(x, y, size, size);
    }
  };

  const roundRectPath = (ctx, x, y, w, h, r) => {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  const drawEyeCanvas = (ctx, gridX, gridY, ms, shape, color, bg, corner) => {
    const outerSize = 7 * ms;
    const innerOffset = 2 * ms;
    const innerSize = 3 * ms;

    const drawShape = (sx, sy, w, h, type, isOuter) => {
      if (type === 'circle') {
        ctx.beginPath();
        ctx.arc(sx + w / 2, sy + h / 2, w / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (type === 'rounded') {
        const r = isOuter ? w * 0.22 : w * 0.18;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(sx, sy, w, h, r);
        else roundRectPath(ctx, sx, sy, w, h, r);
        ctx.fill();
      } else if (type === 'leaf') {
        const r = isOuter ? w * 0.45 : w * 0.4;
        const radii = leafRadii(corner);
        ctx.beginPath();
        roundRectVariable(ctx, sx, sy, w, h, radii.map(v => v * r));
        ctx.fill();
      } else {
        ctx.fillRect(sx, sy, w, h);
      }
    };

    // outer
    ctx.fillStyle = color;
    drawShape(gridX, gridY, outerSize, outerSize, shape, true);
    // hole
    ctx.fillStyle = bg;
    drawShape(gridX + ms, gridY + ms, 5 * ms, 5 * ms, shape, false);
    // inner
    ctx.fillStyle = color;
    drawShape(gridX + innerOffset, gridY + innerOffset, innerSize, innerSize, shape, false);
  };

  // For leaf shape: three corners rounded, sharp corner points toward the QR center.
  const leafRadii = (corner) => {
    // [topLeft, topRight, bottomRight, bottomLeft]
    if (corner === 'tl') return [1, 1, 0, 1]; // sharp BR
    if (corner === 'tr') return [1, 1, 1, 0]; // sharp BL
    if (corner === 'bl') return [0, 1, 1, 1]; // sharp TR
    return [1, 1, 1, 1];
  };

  const roundRectVariable = (ctx, x, y, w, h, radii) => {
    const [tl, tr, br, bl] = radii;
    ctx.moveTo(x + tl, y);
    ctx.lineTo(x + w - tr, y);
    if (tr) ctx.arcTo(x + w, y, x + w, y + tr, tr); else ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h - br);
    if (br) ctx.arcTo(x + w, y + h, x + w - br, y + h, br); else ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + bl, y + h);
    if (bl) ctx.arcTo(x, y + h, x, y + h - bl, bl); else ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + tl);
    if (tl) ctx.arcTo(x, y, x + tl, y, tl); else ctx.lineTo(x, y);
    ctx.closePath();
  };

  // QR BUILDING ===================================================
  const buildQr = (text, ec) => {
    const qr = qrcode(0, ec);
    qr.addData(text);
    qr.make();
    return qr;
  };

  // CANVAS RENDER =================================================
  const renderCanvas = (qr, opts) => {
    const { width, margin, fg, bg, eyeColor, moduleShape, eyeShape, label, labelSize, labelColor, labelBold, logo, logoSize, logoBackdrop } = opts;
    const count = qr.getModuleCount();
    const totalModules = count + margin * 2;
    const moduleSize = Math.max(2, Math.floor(width / totalModules));
    const qrPixels = moduleSize * totalModules;

    // Label sizing
    const labelText = (label || '').trim();
    const labelHeightModules = labelText ? (labelSize + 1.6) : 0;
    const labelPx = labelHeightModules * moduleSize;
    const canvasWidth = qrPixels;
    const canvasHeight = qrPixels + labelPx;

    const canvas = els.canvas;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');

    // BG over entire canvas
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Modules
    ctx.fillStyle = fg;
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (!qr.isDark(r, c)) continue;
        if (isEyeModule(r, c, count)) continue;
        drawModuleCanvas(ctx, (c + margin) * moduleSize, (r + margin) * moduleSize, moduleSize, moduleShape);
      }
    }

    // Eyes
    const eyeCol = eyeColor || fg;
    const positions = [
      { x: margin, y: margin, corner: 'tl' },
      { x: count - 7 + margin, y: margin, corner: 'tr' },
      { x: margin, y: count - 7 + margin, corner: 'bl' },
    ];
    for (const p of positions) {
      drawEyeCanvas(ctx, p.x * moduleSize, p.y * moduleSize, moduleSize, eyeShape, eyeCol, bg, p.corner);
    }

    // Logo
    if (logo) {
      const targetSize = (logoSize / 100) * qrPixels;
      const padding = moduleSize * 1;
      const cx = qrPixels / 2;
      const cy = qrPixels / 2;
      if (logoBackdrop !== 'none') {
        ctx.fillStyle = bg;
        const bx = cx - targetSize / 2 - padding;
        const by = cy - targetSize / 2 - padding;
        const bs = targetSize + padding * 2;
        if (logoBackdrop === 'circle') {
          ctx.beginPath();
          ctx.arc(cx, cy, bs / 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (logoBackdrop === 'rounded') {
          ctx.beginPath();
          const r = bs * 0.18;
          if (ctx.roundRect) ctx.roundRect(bx, by, bs, bs, r);
          else roundRectPath(ctx, bx, by, bs, bs, r);
          ctx.fill();
        } else {
          ctx.fillRect(bx, by, bs, bs);
        }
      }
      try {
        ctx.drawImage(logo, cx - targetSize / 2, cy - targetSize / 2, targetSize, targetSize);
      } catch (_) {}
    }

    // Label
    if (labelText) {
      const fontPx = labelSize * moduleSize;
      const weight = labelBold ? '700' : '500';
      ctx.fillStyle = labelColor;
      ctx.font = `${weight} ${fontPx}px "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labelText, canvasWidth / 2, qrPixels + labelPx / 2);
    }
  };

  // SVG BUILD =====================================================
  const buildSvg = (qr, opts) => {
    const { margin, fg, bg, eyeColor, moduleShape, eyeShape, label, labelSize, labelColor, labelBold, logoDataUrl, logoSize, logoBackdrop } = opts;
    const count = qr.getModuleCount();
    const total = count + margin * 2;
    const labelText = (label || '').trim();
    const labelHeight = labelText ? (labelSize + 1.6) : 0;
    const svgWidth = total;
    const svgHeight = total + labelHeight;

    // Modules → either path (square/rounded/classy) or circles (dots)
    let moduleEls = '';
    if (moduleShape === 'dots') {
      let circles = '';
      for (let r = 0; r < count; r++) {
        for (let c = 0; c < count; c++) {
          if (!qr.isDark(r, c) || isEyeModule(r, c, count)) continue;
          circles += `<circle cx="${c + margin + 0.5}" cy="${r + margin + 0.5}" r="0.45"/>`;
        }
      }
      moduleEls = `<g fill="${fg}">${circles}</g>`;
    } else {
      const rx = moduleShape === 'rounded' ? 0.3 : (moduleShape === 'classy' ? 0.12 : 0);
      let rects = '';
      for (let r = 0; r < count; r++) {
        for (let c = 0; c < count; c++) {
          if (!qr.isDark(r, c) || isEyeModule(r, c, count)) continue;
          rects += `<rect x="${c + margin}" y="${r + margin}" width="1" height="1" rx="${rx}"/>`;
        }
      }
      moduleEls = `<g fill="${fg}">${rects}</g>`;
    }

    // Eyes
    const eyeCol = eyeColor || fg;
    const eyes = [
      { x: margin, y: margin, corner: 'tl' },
      { x: count - 7 + margin, y: margin, corner: 'tr' },
      { x: margin, y: count - 7 + margin, corner: 'bl' },
    ];
    let eyeEls = '';
    for (const e of eyes) eyeEls += buildEyeSvg(e.x, e.y, eyeShape, eyeCol, bg, e.corner);

    // Logo
    let logoEl = '';
    if (logoDataUrl) {
      const logoUnits = (logoSize / 100) * total;
      const cx = total / 2, cy = total / 2;
      const padding = 1;
      if (logoBackdrop !== 'none') {
        const bs = logoUnits + padding * 2;
        const bx = cx - bs / 2, by = cy - bs / 2;
        if (logoBackdrop === 'circle') {
          logoEl += `<circle cx="${cx}" cy="${cy}" r="${bs / 2}" fill="${bg}"/>`;
        } else if (logoBackdrop === 'rounded') {
          logoEl += `<rect x="${bx}" y="${by}" width="${bs}" height="${bs}" rx="${bs * 0.18}" fill="${bg}"/>`;
        } else {
          logoEl += `<rect x="${bx}" y="${by}" width="${bs}" height="${bs}" fill="${bg}"/>`;
        }
      }
      logoEl += `<image href="${logoDataUrl}" x="${cx - logoUnits / 2}" y="${cy - logoUnits / 2}" width="${logoUnits}" height="${logoUnits}" preserveAspectRatio="xMidYMid meet"/>`;
    }

    // Label
    let labelEl = '';
    if (labelText) {
      const fontSize = labelSize;
      const weight = labelBold ? '700' : '500';
      const y = total + labelHeight / 2;
      labelEl = `<text x="${total / 2}" y="${y}" fill="${labelColor}" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="${fontSize}" font-weight="${weight}" text-anchor="middle" dominant-baseline="middle">${escapeXml(labelText)}</text>`;
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" shape-rendering="${moduleShape === 'square' ? 'crispEdges' : 'geometricPrecision'}">
  <rect width="${svgWidth}" height="${svgHeight}" fill="${bg}"/>
  ${moduleEls}
  ${eyeEls}
  ${logoEl}
  ${labelEl}
</svg>`;
  };

  const buildEyeSvg = (gx, gy, shape, color, bg, corner) => {
    const outerShape = (x, y, w, h, isOuter, fill) => {
      if (shape === 'circle') {
        return `<circle cx="${x + w / 2}" cy="${y + h / 2}" r="${w / 2}" fill="${fill}"/>`;
      }
      if (shape === 'rounded') {
        const r = isOuter ? w * 0.22 : w * 0.18;
        return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"/>`;
      }
      if (shape === 'leaf') {
        const radii = leafRadii(corner);
        const r = (isOuter ? w * 0.45 : w * 0.4);
        const [tl, tr, br, bl] = radii.map(v => v * r);
        const path = leafPath(x, y, w, h, tl, tr, br, bl);
        return `<path d="${path}" fill="${fill}"/>`;
      }
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
    };
    return [
      outerShape(gx, gy, 7, 7, true, color),
      outerShape(gx + 1, gy + 1, 5, 5, false, bg),
      outerShape(gx + 2, gy + 2, 3, 3, false, color),
    ].join('');
  };

  const leafPath = (x, y, w, h, tl, tr, br, bl) => {
    return `M${x + tl},${y}
    L${x + w - tr},${y}
    ${tr ? `A${tr},${tr} 0 0 1 ${x + w},${y + tr}` : ''}
    L${x + w},${y + h - br}
    ${br ? `A${br},${br} 0 0 1 ${x + w - br},${y + h}` : ''}
    L${x + bl},${y + h}
    ${bl ? `A${bl},${bl} 0 0 1 ${x},${y + h - bl}` : ''}
    L${x},${y + tl}
    ${tl ? `A${tl},${tl} 0 0 1 ${x + tl},${y}` : ''} Z`;
  };

  // MAIN RENDER ===================================================
  const render = () => {
    const text = els.content.value.trim();
    els.charCount.textContent = els.content.value.length;
    els.sizeValue.textContent = `${els.size.value} px`;
    els.marginValue.textContent = els.margin.value;
    els.logoSizeValue.textContent = `${els.logoSize.value}%`;
    els.labelSizeValue.textContent = LABEL_SIZE_NAMES[els.labelSize.value] || 'Medium';

    // Logo warning
    const hasLogo = !!state.logoImage;
    const ec = els.ecLevel.value;
    if (hasLogo && (ec === 'L' || ec === 'M')) {
      els.logoWarning.hidden = false;
    } else {
      els.logoWarning.hidden = true;
    }

    if (typeof qrcode === 'undefined') {
      els.canvas.classList.remove('is-ready');
      els.emptyState.style.display = '';
      setOutputsEnabled(false);
      showLibError();
      return;
    }

    if (!text) {
      els.canvas.classList.remove('is-ready');
      els.emptyState.style.display = '';
      setOutputsEnabled(false);
      return;
    }

    const opts = {
      width: parseInt(els.size.value, 10),
      margin: parseInt(els.margin.value, 10),
      fg: els.fgColor.value,
      bg: els.bgColor.value,
      eyeColor: state.eyeColorSync ? els.fgColor.value : els.eyeColor.value,
      moduleShape: state.moduleShape,
      eyeShape: state.eyeShape,
      logo: state.logoImage,
      logoDataUrl: state.logoDataUrl,
      logoSize: parseInt(els.logoSize.value, 10),
      logoBackdrop: els.logoBackdrop.value,
      label: els.labelText.value,
      labelSize: parseInt(els.labelSize.value, 10),
      labelColor: els.labelColor.value,
      labelBold: els.labelBold.checked,
    };

    try {
      const qr = buildQr(text, ec);
      renderCanvas(qr, opts);
      state.lastSvg = buildSvg(qr, opts);
      els.canvas.classList.add('is-ready');
      els.emptyState.style.display = 'none';
      setOutputsEnabled(true);
    } catch (err) {
      console.error('QR generation failed:', err);
      els.canvas.classList.remove('is-ready');
      els.emptyState.style.display = '';
      setOutputsEnabled(false);
      const msg = String(err && err.message || err);
      if (/overflow|too long|length/i.test(msg)) {
        showToast('Content too long — try lower error correction (L)');
      } else {
        showToast(`Error: ${msg.slice(0, 80)}`);
      }
    }
  };

  const renderDebounced = debounce(render, 80);

  // ERROR HELPERS =================================================
  const showLibError = () => {
    els.emptyState.innerHTML = `
      <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <p><strong>Could not load QR library</strong><br/>
      Make sure <code>vendor/qrcode.min.js</code> exists next to <code>index.html</code>.</p>
    `;
  };

  // DOWNLOAD ======================================================
  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  els.downloadPng.addEventListener('click', () => {
    if (!state.lastValid) return;
    els.canvas.toBlob((blob) => {
      if (!blob) return;
      downloadBlob(blob, `${safeFilename(els.content.value.trim())}.png`);
      showToast('PNG downloaded');
    }, 'image/png');
  });

  els.downloadSvg.addEventListener('click', () => {
    if (!state.lastValid || !state.lastSvg) return;
    const blob = new Blob([state.lastSvg], { type: 'image/svg+xml;charset=utf-8' });
    downloadBlob(blob, `${safeFilename(els.content.value.trim())}.svg`);
    showToast('SVG downloaded');
  });

  els.copyImage.addEventListener('click', async () => {
    if (!state.lastValid) return;
    try {
      const blob = await new Promise((resolve) => els.canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('No blob');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      showToast('Copied to clipboard');
    } catch (err) {
      console.error(err);
      showToast('Copy not supported in this browser');
    }
  });

  // COLOR HANDLERS ================================================
  els.swapColors.addEventListener('click', () => {
    const fg = els.fgColor.value;
    els.fgColor.value = els.bgColor.value;
    els.bgColor.value = fg;
    if (state.eyeColorSync) els.eyeColor.value = els.fgColor.value;
    render();
  });

  els.resetColors.addEventListener('click', () => {
    els.fgColor.value = DEFAULTS.fg;
    els.bgColor.value = DEFAULTS.bg;
    if (state.eyeColorSync) els.eyeColor.value = els.fgColor.value;
    render();
  });

  els.syncEyeColor.addEventListener('click', () => {
    state.eyeColorSync = true;
    els.eyeColor.value = els.fgColor.value;
    render();
  });

  els.eyeColor.addEventListener('input', () => {
    state.eyeColorSync = false;
    render();
  });

  els.fgColor.addEventListener('input', () => {
    if (state.eyeColorSync) els.eyeColor.value = els.fgColor.value;
    if (!els.labelText.value) els.labelColor.value = els.fgColor.value;
    render();
  });

  els.presets.forEach((btn) => {
    btn.addEventListener('click', () => {
      els.fgColor.value = btn.dataset.fg;
      els.bgColor.value = btn.dataset.bg;
      if (state.eyeColorSync) els.eyeColor.value = btn.dataset.fg;
      els.labelColor.value = btn.dataset.fg;
      render();
    });
  });

  // SHAPE PICKERS =================================================
  const wireShapeGroup = (group, key) => {
    group.querySelectorAll('.shape-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('.shape-btn').forEach((b) => {
          b.classList.remove('is-active');
          b.setAttribute('aria-checked', 'false');
        });
        btn.classList.add('is-active');
        btn.setAttribute('aria-checked', 'true');
        state[key] = btn.dataset.shape;
        render();
      });
    });
  };
  wireShapeGroup(els.moduleShapeGroup, 'moduleShape');
  wireShapeGroup(els.eyeShapeGroup, 'eyeShape');

  // LOGO HANDLERS =================================================
  const setLogo = (file) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      showToast('Please choose an image file');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const img = new Image();
      img.onload = () => {
        state.logoImage = img;
        state.logoDataUrl = dataUrl;
        state.logoName = file.name;
        els.logoPreview.src = dataUrl;
        els.logoName.textContent = file.name;
        els.logoEmpty.hidden = true;
        els.logoFilled.hidden = false;
        els.logoControls.hidden = false;
        // Auto-suggest H if EC is too low
        if (els.ecLevel.value === 'L' || els.ecLevel.value === 'M') {
          els.ecLevel.value = 'H';
          showToast('Bumped error correction to High for logo');
        }
        render();
      };
      img.onerror = () => showToast('Could not load that image');
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  els.logoDropzone.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    els.logoFile.click();
  });
  els.logoFile.addEventListener('change', (e) => setLogo(e.target.files[0]));
  els.logoRemove.addEventListener('click', (e) => {
    e.stopPropagation();
    state.logoImage = null;
    state.logoDataUrl = null;
    state.logoName = '';
    els.logoFile.value = '';
    els.logoEmpty.hidden = false;
    els.logoFilled.hidden = true;
    els.logoControls.hidden = true;
    render();
  });

  ;['dragenter', 'dragover'].forEach((evt) => {
    els.logoDropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      els.logoDropzone.classList.add('is-dragging');
    });
  });
  ;['dragleave', 'drop'].forEach((evt) => {
    els.logoDropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      els.logoDropzone.classList.remove('is-dragging');
    });
  });
  els.logoDropzone.addEventListener('drop', (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (file) setLogo(file);
  });

  // TABS ==========================================================
  els.tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      els.tabs.forEach((t) => { t.classList.remove('is-active'); t.setAttribute('aria-selected', 'false'); });
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');
      els.tabPanels.forEach((p) => p.classList.toggle('is-active', p.dataset.panel === target));
    });
  });

  // GENERAL INPUT BINDINGS ========================================
  const bindings = [
    els.content, els.size, els.margin, els.ecLevel, els.bgColor,
    els.logoSize, els.logoBackdrop,
    els.labelText, els.labelSize, els.labelColor, els.labelBold,
  ];
  ['input', 'change'].forEach((evt) => {
    bindings.forEach((el) => el && el.addEventListener(evt, renderDebounced));
  });

  // THEME =========================================================
  const initTheme = () => {
    const stored = localStorage.getItem('qr-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = stored || (prefersDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  };
  els.themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('qr-theme', next);
  });
  initTheme();

  // BOOT ==========================================================
  if (typeof qrcode === 'undefined') {
    showLibError();
    showToast('QR library could not load');
  } else {
    els.content.value = 'https://github.com';
    render();
    els.content.focus();
    els.content.select();
  }
})();
