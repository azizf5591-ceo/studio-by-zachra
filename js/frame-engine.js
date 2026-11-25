// Deteksi otomatis lubang foto (transparan ATAU kotak putih solid di dalam bingkai)
function detectTransparentHolesFromImage(img) {
  const scanW = 320;
  const scale = scanW / img.width;
  const scanH = Math.max(1, Math.round(img.height * scale));
  const c = document.createElement('canvas');
  c.width = scanW;
  c.height = scanH;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, scanW, scanH);

  const data = ctx.getImageData(0, 0, scanW, scanH).data;

  // Fungsi pemindai area berdasarkan kondisi piksel (transparan atau putih murni)
  function scanRegions(isHolePixel) {
    const visited = new Uint8Array(scanW * scanH);
    const regions = [];
    // Margin 3% dari tepi luar agar border putih di pinggir kertas tidak ikut terdeteksi
    const marginX = Math.max(3, Math.round(scanW * 0.03));
    const marginY = Math.max(3, Math.round(scanH * 0.03));

    for (let y = marginY; y < scanH - marginY; y++) {
      for (let x = marginX; x < scanW - marginX; x++) {
        const idx = y * scanW + x;
        if (!visited[idx] && isHolePixel(idx)) {
          let minX = x, maxX = x, minY = y, maxY = y, count = 0;
          const queue = [idx];
          visited[idx] = 1;

          while (queue.length > 0) {
            const curr = queue.pop();
            const cx = curr % scanW;
            const cy = (curr / scanW) | 0;
            count++;
            if (cx < minX) minX = cx;
            if (cx > maxX) maxX = cx;
            if (cy < minY) minY = cy;
            if (cy > maxY) maxY = cy;

            const neighbors = [curr - 1, curr + 1, curr - scanW, curr + scanW];
            for (let n = 0; n < 4; n++) {
              const nb = neighbors[n];
              const nx = nb % scanW;
              const ny = (nb / scanW) | 0;
              if (
                nx >= marginX && nx < scanW - marginX &&
                ny >= marginY && ny < scanH - marginY &&
                !visited[nb] && Math.abs(nx - cx) <= 1 && isHolePixel(nb)
              ) {
                visited[nb] = 1;
                queue.push(nb);
              }
            }
          }

          const wRatio = (maxX - minX + 1) / scanW;
          const hRatio = (maxY - minY + 1) / scanH;
          if (count > 220 && wRatio > 0.14 && hRatio > 0.09 && wRatio < 0.94 && hRatio < 0.94) {
            regions.push({
              x: Math.max(0, (minX - 2) / scanW),
              y: Math.max(0, (minY - 2) / scanH),
              w: Math.min(1, (maxX - minX + 5) / scanW),
              h: Math.min(1, (maxY - minY + 5) / scanH)
            });
          }
        }
      }
    }
    return regions;
  }

  // 1. Cari lubang transparan (alpha < 60)
  let holes = scanRegions((idx) => data[idx * 4 + 3] < 60);

  // 2. Gabungkan kotak-kotak yang tumpang tindih (misalnya terbelah garis putus-putus dekorasi)
  holes = mergeOverlappingRects(holes);

  // 3. Jika lubang yang ditemukan terlalu sedikit (misal kotak putih solid), pindai juga area putih murni
  if (holes.length < 2) {
    const whiteHoles = scanRegions((idx) => {
      const i = idx * 4;
      return data[i + 3] >= 240 && data[i] > 246 && data[i + 1] > 246 && data[i + 2] > 246;
    });
    if (whiteHoles.length > holes.length) {
      holes = mergeOverlappingRects(whiteHoles);
    }
  }

  // Urutkan dari baris atas ke bawah, lalu kolom kiri ke kanan
  holes.sort((a, b) => (Math.abs(a.y - b.y) > 0.05 ? a.y - b.y : a.x - b.x));
  return holes;
}

// Menggabungkan pecahan lubang yang berada dalam satu kotak foto yang sama
function mergeOverlappingRects(rects) {
  const merged = [];
  rects.forEach(r => {
    const existing = merged.find(m => {
      const overlapX = Math.max(0, Math.min(m.x + m.w, r.x + r.w) - Math.max(m.x, r.x));
      const overlapY = Math.max(0, Math.min(m.y + m.h, r.y + r.h) - Math.max(m.y, r.y));
      return overlapX > Math.min(m.w, r.w) * 0.45 && overlapY > Math.min(m.h, r.h) * 0.45;
    });
    if (existing) {
      const newX = Math.min(existing.x, r.x);
      const newY = Math.min(existing.y, r.y);
      existing.w = Math.max(existing.x + existing.w, r.x + r.w) - newX;
      existing.h = Math.max(existing.y + existing.h, r.y + r.h) - newY;
      existing.x = newX;
      existing.y = newY;
    } else {
      merged.push({ ...r });
    }
  });
  return merged;
}

function loadFrameOverlayImage(frameObj) {
  return new Promise(resolve => {
    if (!frameObj.imageSrc) return resolve();
    const img = new Image();
    img.onload = () => {
      frameObj.overlayImg = img;
      frameObj.canvasW = img.naturalWidth || 600;
      frameObj.canvasH = img.naturalHeight || 1800;

      const detected = detectTransparentHolesFromImage(img);
      if (detected.length > 0) {
        frameObj.customRects = detected;
        frameObj.shots = detected.length;
        frameObj.badge = `${detected.length} Pose`;
      } else {
        frameObj.customRects = [
          { x: 0.08, y: 0.06, w: 0.84, h: 0.25 },
          { x: 0.08, y: 0.34, w: 0.84, h: 0.25 },
          { x: 0.08, y: 0.62, w: 0.84, h: 0.25 }
        ];
        frameObj.shots = 3;
        frameObj.badge = '3 Pose';
      }

      const ratio = frameObj.canvasW / frameObj.canvasH;
      if (ratio < 0.45) {
        frameObj.dimension = '2 x 6 inci Strip';
        frameObj.price = 25000;
      } else if (ratio > 1.1) {
        frameObj.dimension = '6 x 4 inci Landscape';
        frameObj.price = frameObj.shots >= 5 ? 40000 : 35000;
      } else {
        frameObj.dimension = '4 x 6 / 4 x 5 inci';
        frameObj.price = frameObj.shots >= 5 ? 40000 : 35000;
      }
      resolve();
    };
    img.onerror = () => resolve();
    img.src = frameObj.imageSrc;
  });
}

function getFrameSlotRects(frame) {
  const W = frame.canvasW;
  const H = frame.canvasH;
  if (frame.customRects && frame.customRects.length > 0) {
    return frame.customRects.map(r => ({
      x: Math.round(r.x * W),
      y: Math.round(r.y * H),
      w: Math.round(r.w * W),
      h: Math.round(r.h * H)
    }));
  }
  const pad = Math.round(W * 0.065);
  const footerH = Math.round(H * 0.13);
  const availH = H - footerH - pad * 4;
  const slotH = Math.floor(availH / 3);
  const slotW = W - pad * 2;
  return [0, 1, 2].map(i => ({ x: pad, y: pad + i * (slotH + pad), w: slotW, h: slotH }));
}

function drawImageCover(ctx, img, x, y, w, h) {
  const imgRatio = img.width / img.height;
  const targetRatio = w / h;
  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  if (imgRatio > targetRatio) {
    sw = img.height * targetRatio;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / targetRatio;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

async function renderCompositeFrameToCanvas(canvas, photoSourcesArray) {
  const frame = state.selectedFrame;
  canvas.width = frame.canvasW;
  canvas.height = frame.canvasH;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = state.frameBgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const rects = getFrameSlotRects(frame);
  const loadedImgs = await Promise.all(
    photoSourcesArray.map(src => {
      return new Promise(resolve => {
        if (!src) return resolve(null);
        const im = new Image();
        im.onload = () => resolve(im);
        im.src = src;
      });
    })
  );

  ctx.save();
  ctx.filter = state.selectedFilter.canvasFilter;
  rects.forEach((rect, i) => {
    if (loadedImgs[i]) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(rect.x, rect.y, rect.w, rect.h);
      ctx.clip();
      drawImageCover(ctx, loadedImgs[i], rect.x, rect.y, rect.w, rect.h);
      ctx.restore();
    }
  });
  ctx.restore();

  if (frame.overlayImg) {
    ctx.drawImage(frame.overlayImg, 0, 0, canvas.width, canvas.height);
  }

  const caption = document.getElementById('frameCaptionInput').value.trim();
  if (caption) {
    ctx.fillStyle = state.frameTextColor;
    ctx.textAlign = 'center';
    ctx.font = `bold ${Math.round(canvas.width * 0.032)}px "Space Grotesk", sans-serif`;
    ctx.fillText(caption.toUpperCase(), canvas.width / 2, canvas.height - Math.round(canvas.height * 0.025));
  }
}

async function updateReviewCanvas() {
  const canvas = document.getElementById('reviewFrameCanvas');
  const activeList = state.processedPhotos.length ? state.processedPhotos : state.capturedPhotos;
  await renderCompositeFrameToCanvas(canvas, activeList);
}