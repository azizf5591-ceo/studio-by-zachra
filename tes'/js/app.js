window.addEventListener('DOMContentLoaded', async () => {
  await Promise.all(FRAME_TEMPLATES.map(f => loadFrameOverlayImage(f)));
  renderFrameCards();
  selectFrame(FRAME_TEMPLATES[0].id);
  renderFilterButtons();
  generateDefaultQrisCode();

  // Muat pengaturan studio dari Supabase (jika tersedia)
  if (typeof loadStudioSettingsFromCloud === 'function') {
    const cloudSettings = await loadStudioSettingsFromCloud();
    if (cloudSettings) {
      if (cloudSettings.studio_name) {
        state.studioName = cloudSettings.studio_name;
        document.getElementById('headerStudioName').textContent = cloudSettings.studio_name;
        document.getElementById('merchantNameDisplay').textContent = cloudSettings.studio_name.toUpperCase();
        document.getElementById('portalStudioTitle').textContent = cloudSettings.studio_name;
      }
      if (cloudSettings.custom_qris_url) {
        state.customQrisDataUrl = cloudSettings.custom_qris_url;
        updateQrisPaymentDisplay();
      }
    }
  }

  // Cek apakah dibuka dari HP pelanggan lewat scan QR (?session=SB-XXXX)
  const urlParams = new URLSearchParams(window.location.search);
  const sharedSessionCode = urlParams.get('session');
  if (sharedSessionCode) {
    await loadSharedSessionFromCloud(sharedSessionCode);
  }
});

// Membuka Portal Download otomatis saat link QR di-scan dari HP pelanggan
async function loadSharedSessionFromCloud(sessionCode) {
  if (typeof supabaseClient === 'undefined') return;
  showToast('Membuka galeri foto sesi #' + sessionCode + '...', '📲');

  const formattedCode = sessionCode.startsWith('#') ? sessionCode : '#' + sessionCode;
  const { data, error } = await supabaseClient
    .from('sessions')
    .select('*')
    .or(`session_code.eq.${sessionCode},session_code.eq.${formattedCode}`)
    .single();

  if (error || !data) {
    showToast('Sesi foto tidak ditemukan atau sudah kedaluwarsa.', '⚠️');
    return;
  }

  state.sessionId = data.session_code.replace('#', '');
  state.finalFullFrameDataUrl = data.full_frame_url;
  state.finalGifDataUrl = data.gif_url || data.full_frame_url;
  state.finalSinglePhotos = Array.isArray(data.single_photos_urls) ? data.single_photos_urls : [];

  document.getElementById('portalUrlId').textContent = state.sessionId;
  if (data.full_frame_url) {
    document.getElementById('portalFullFrameImg').src = data.full_frame_url;
  }
  if (data.gif_url || data.full_frame_url) {
    document.getElementById('portalGifImg').src = data.gif_url || data.full_frame_url;
  }

  const portalGrid = document.getElementById('portalSinglePhotosGrid');
  portalGrid.innerHTML = '';
  state.finalSinglePhotos.forEach((url, i) => {
    const portalCard = document.createElement('div');
    portalCard.className = 'bg-white border border-sky-100 rounded-xl p-2 flex flex-col items-center shadow-sm';
    portalCard.innerHTML = `
      <div class="relative w-full aspect-[4/3] rounded-lg overflow-hidden mb-2">
        <img src="${url}" class="w-full h-full object-cover" />
        <span class="absolute top-1 left-1 bg-slate-900/75 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">#${i + 1}</span>
      </div>
      <a href="${url}" download="SnapBooth-${state.sessionId}-Foto-${i + 1}.jpg" target="_blank" class="w-full py-1.5 px-2 rounded-lg bg-slate-900 hover:bg-sky-600 text-white text-[11px] font-bold transition text-center block">
        ⬇️ Simpan #${i + 1}
      </a>
    `;
    portalGrid.appendChild(portalCard);
  });

  openCustomerMobilePortal();
}

function showToast(msg, icon = '✨') {
  const box = document.getElementById('toastBox');
  document.getElementById('toastMessage').textContent = msg;
  document.getElementById('toastIcon').textContent = icon;
  box.classList.remove('hidden');
  clearTimeout(window._toastTimeout);
  window._toastTimeout = setTimeout(() => {
    box.classList.add('hidden');
  }, 3000);
}

function goToScreen(screenId) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  const target = document.getElementById(screenId);
  if (target) target.classList.add('active');

  const stepMap = {
    'screen-frames': 1,
    'screen-payment': 2,
    'screen-camera': 3,
    'screen-review': 4,
    'screen-download': 5
  };
  const currentStep = stepMap[screenId] || 0;
  const indicator = document.getElementById('stepIndicator');
  if (currentStep === 0) {
    indicator.classList.add('hidden');
  } else {
    indicator.classList.remove('hidden');
    for (let i = 1; i <= 5; i++) {
      const badge = document.getElementById(`step-${i}`);
      if (i === currentStep) {
        badge.className = 'px-3 py-1.5 rounded-full bg-brand-600 text-white font-bold shadow';
      } else if (i < currentStep) {
        badge.className = 'px-3 py-1.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
      } else {
        badge.className = 'px-3 py-1.5 rounded-full bg-slate-800 text-slate-400';
      }
    }
  }

  if (screenId !== 'screen-camera') {
    stopCameraStream();
  }
  if (screenId !== 'screen-download' && state.liveAnimFrameId) {
    cancelAnimationFrame(state.liveAnimFrameId);
  }
}

function confirmResetToWelcome() {
  stopCameraStream();
  goToScreen('screen-welcome');
}

// ==================== ADMIN MODAL ====================
function openAdminModal() {
  document.getElementById('adminStudioNameInput').value = state.studioName;
  document.getElementById('adminModal').classList.remove('hidden');
  document.getElementById('adminModal').classList.add('flex');
}

function closeAdminModal() {
  document.getElementById('adminModal').classList.add('hidden');
  document.getElementById('adminModal').classList.remove('flex');
}

function handleAdminQrisUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    state.customQrisDataUrl = e.target.result;
    document.getElementById('adminQrisThumb').src = state.customQrisDataUrl;
    document.getElementById('adminQrisPreviewBox').classList.remove('hidden');
    document.getElementById('adminQrisPreviewBox').classList.add('flex');
    updateQrisPaymentDisplay();
    showToast('Gambar QRIS pribadi berhasil dimuat!', '✅');
  };
  reader.readAsDataURL(file);
}

function resetAdminQris() {
  state.customQrisDataUrl = null;
  document.getElementById('adminQrisPreviewBox').classList.add('hidden');
  document.getElementById('adminQrisUpload').value = '';
  updateQrisPaymentDisplay();
  showToast('Kembali ke QRIS default', 'ℹ️');
}

function handleAdminFrameUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const title = document.getElementById('customFrameTitleInput').value.trim() || 'Custom Frame PNG';
    const price = parseInt(document.getElementById('customFramePriceInput').value, 10) || 35000;
    const newFrame = {
      id: 'custom-' + Date.now(),
      name: title,
      dimension: 'Custom PNG',
      shots: 3,
      price: price,
      canvasW: 600,
      canvasH: 1800,
      layoutType: 'auto_png',
      badge: 'Custom PNG',
      imageSrc: e.target.result,
      overlayImg: null,
      customRects: []
    };
    await loadFrameOverlayImage(newFrame);
    FRAME_TEMPLATES.push(newFrame);
    renderFrameCards();
    selectFrame(newFrame.id);
    showToast(`Frame "${title}" ditambahkan!`, '🖼️');
  };
  reader.readAsDataURL(file);
}

async function saveAdminSettings() {
  const newName = document.getElementById('adminStudioNameInput').value.trim();
  if (newName) {
    state.studioName = newName;
    document.getElementById('headerStudioName').textContent = newName;
    document.getElementById('merchantNameDisplay').textContent = newName.toUpperCase();
    document.getElementById('portalStudioTitle').textContent = newName;
  }

  // Simpan perubahan pengaturan studio ke Supabase Database
  if (typeof supabaseClient !== 'undefined') {
    let qrisPublicUrl = state.customQrisDataUrl;
    if (state.customQrisDataUrl && state.customQrisDataUrl.startsWith('data:image')) {
      const qrisBlob = dataURLToBlob(state.customQrisDataUrl);
      const uploadedQris = await uploadFileToSupabase(qrisBlob, 'settings/custom-qris.png', 'image/png');
      if (uploadedQris) qrisPublicUrl = uploadedQris;
    }

    await supabaseClient
      .from('studio_settings')
      .update({
        studio_name: state.studioName,
        custom_qris_url: qrisPublicUrl,
        updated_at: new Date().toISOString()
      })
      .eq('id', 1);
  }

  closeAdminModal();
  showToast('Pengaturan studio disimpan ke cloud!', '💾');
}

// ==================== FRAME SELECTION & PAYMENT ====================
function formatRupiah(num) {
  return 'Rp ' + num.toLocaleString('id-ID');
}

function renderFrameCards() {
  const grid = document.getElementById('frameGrid');
  grid.innerHTML = '';

  FRAME_TEMPLATES.forEach(frame => {
    const isSelected = state.selectedFrame && state.selectedFrame.id === frame.id;
    const card = document.createElement('div');
    card.onclick = () => selectFrame(frame.id);
    card.className = `cursor-pointer rounded-3xl p-4 border-2 transition-all flex flex-col justify-between ${
      isSelected
        ? 'bg-brand-500/10 border-brand-500 shadow-lg shadow-brand-500/15 scale-[1.01]'
        : 'bg-studio-card border-studio-border hover:border-slate-600'
    }`;

    card.innerHTML = `
      <div>
        <div class="flex items-center justify-between mb-3">
          <span class="text-[11px] font-bold px-2.5 py-0.5 rounded-full ${isSelected ? 'bg-brand-500 text-white' : 'bg-slate-800 text-slate-300'}">${frame.badge}</span>
          <span class="text-xs font-mono text-slate-400">${frame.dimension}</span>
        </div>
        <div class="h-52 bg-slate-900/80 rounded-2xl mb-4 p-3 flex items-center justify-center overflow-hidden">
          <img src="${frame.imageSrc}" alt="${frame.name}" class="max-h-full max-w-full object-contain rounded shadow-lg" />
        </div>
        <h3 class="font-bold text-white text-base mb-1">${frame.name}</h3>
        <p class="text-xs text-slate-400 mb-3">${frame.shots} Kali Jepretan • Live & GIF Included</p>
      </div>
      <div class="pt-3 border-t border-slate-800 flex items-center justify-between">
        <span class="font-display font-extrabold text-lg text-brand-400">${formatRupiah(frame.price)}</span>
        <span class="text-xs font-bold ${isSelected ? 'text-brand-400' : 'text-slate-500'}">${isSelected ? '✓ Terpilih' : 'Pilih'}</span>
      </div>
    `;
    grid.appendChild(card);
  });
}

function selectFrame(frameId) {
  const found = FRAME_TEMPLATES.find(f => f.id === frameId);
  if (!found) return;
  state.selectedFrame = found;
  document.getElementById('selectedFrameNameLabel').textContent = found.name;
  document.getElementById('selectedFramePriceLabel').textContent = formatRupiah(found.price);
  renderFrameCards();
}

function selectFrameColor(bg, text, btnEl) {
  state.frameBgColor = bg;
  state.frameTextColor = text;
  document.querySelectorAll('.color-swatch').forEach(b => {
    b.classList.remove('ring-2', 'ring-brand-500/40', 'border-brand-500');
  });
  btnEl.classList.add('ring-2', 'ring-brand-500/40', 'border-brand-500');
}

function proceedToPayment() {
  document.getElementById('paySummaryFrame').textContent = state.selectedFrame.name;
  document.getElementById('paySummaryDimension').textContent = state.selectedFrame.dimension;
  document.getElementById('paySummaryTotal').textContent = formatRupiah(state.selectedFrame.price);
  updateQrisPaymentDisplay();
  startPaymentCountdown();
  goToScreen('screen-payment');
}

function generateDefaultQrisCode() {
  const container = document.getElementById('qrisGeneratedCode');
  if (!container) return;
  container.innerHTML = '';
  new QRCode(container, {
    text: '00020101021126570011ID.CO.QRIS.WWW01189360091400000000000210ID1020304055204599953033605802ID5916SNAPBOOTH STUDIO6006BEKASI6304A1B2',
    width: 150,
    height: 150,
    colorDark: '#0f172a',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M
  });
}

function updateQrisPaymentDisplay() {
  const customImg = document.getElementById('qrisCustomImg');
  const defaultVis = document.getElementById('qrisDefaultVisual');
  if (state.customQrisDataUrl) {
    customImg.src = state.customQrisDataUrl;
    customImg.classList.remove('hidden');
    defaultVis.classList.add('hidden');
  } else {
    customImg.classList.add('hidden');
    defaultVis.classList.remove('hidden');
  }
}

function selectPaymentMethod(method) {
  state.paymentMethod = method;
  ['qris', 'ewallet', 'card'].forEach(m => {
    const btn = document.getElementById(`pay-btn-${m}`);
    const dot = btn.querySelector('span:last-child');
    if (m === method) {
      btn.className = 'pay-method-btn flex items-center justify-between p-4 rounded-2xl bg-brand-500/15 border-2 border-brand-500 text-left transition';
      dot.className = 'w-5 h-5 rounded-full border-4 border-brand-500 bg-white';
    } else {
      btn.className = 'pay-method-btn flex items-center justify-between p-4 rounded-2xl bg-studio-card border-2 border-studio-border hover:border-slate-600 text-left transition';
      dot.className = 'w-5 h-5 rounded-full border-2 border-slate-600';
    }
  });

  const instr = document.getElementById('paymentInstructionText');
  if (method === 'qris') {
    instr.textContent = 'Buka aplikasi e-wallet atau mobile banking Anda, lalu scan kode QRIS di atas sesuai nominal tagihan.';
  } else if (method === 'ewallet') {
    instr.textContent = 'Scan QR di atas menggunakan aplikasi GoPay, OVO, DANA, atau ShopeePay Anda.';
  } else {
    instr.textContent = 'Silakan tempelkan (Tap) kartu Debit/Kredit Contactless pada mesin reader di bawah layar atau scan QR.';
  }
}

function startPaymentCountdown() {
  clearInterval(state.paymentTimerInterval);
  let seconds = 299;
  const timerEl = document.getElementById('paymentTimer');
  state.paymentTimerInterval = setInterval(() => {
    seconds--;
    if (seconds <= 0) {
      clearInterval(state.paymentTimerInterval);
      timerEl.textContent = '00:00';
      return;
    }
    const m = String(Math.floor(seconds / 60)).padStart(2, '0');
    const s = String(seconds % 60).padStart(2, '0');
    timerEl.textContent = `${m}:${s}`;
  }, 1000);
}

function confirmPaymentSuccess() {
  clearInterval(state.paymentTimerInterval);
  playBeepSound(880, 0.15);
  showToast('Pembayaran terverifikasi! Bersiap untuk foto...', '🎉');

  const totalShots = state.selectedFrame.shots;
  state.capturedPhotos = new Array(totalShots).fill(null);
  state.capturedBursts = new Array(totalShots).fill(null);
  state.processedPhotos = new Array(totalShots).fill(null);
  state.photoMasks = {};
  state.camBgMode = 'none';
  state.retakeSlotIndex = null;
  state.selectedFilter = FILTERS[0];

  goToScreen('screen-camera');
  initCameraBooth();
}

// ==================== REVIEW & FILTER ====================
async function openReviewScreen() {
  goToScreen('screen-review');
  await rebuildProcessedPhotosWithBackground();
}

function renderReviewRetakeCards() {
  const grid = document.getElementById('reviewRetakeGrid');
  grid.innerHTML = '';
  const activeList = state.processedPhotos.length ? state.processedPhotos : state.capturedPhotos;
  activeList.forEach((photoUrl, idx) => {
    const item = document.createElement('div');
    item.className = 'bg-slate-900 border border-slate-700 rounded-2xl p-2 flex flex-col items-center';
    item.innerHTML = `
      <div class="w-full aspect-[4/3] rounded-xl overflow-hidden mb-2 relative">
        <img src="${photoUrl}" style="filter: ${state.selectedFilter.css}" class="w-full h-full object-cover" />
        <span class="absolute top-1 left-1 bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">#${idx + 1}</span>
      </div>
      <button onclick="retakePhotoSlot(${idx})" class="w-full py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-brand-600 text-white text-xs font-bold transition flex items-center justify-center gap-1">
        <span>🔄 Retake</span>
      </button>
    `;
    grid.appendChild(item);
  });
}

function retakePhotoSlot(idx) {
  const oldPhoto = state.capturedPhotos[idx];
  if (oldPhoto && state.photoMasks[oldPhoto]) {
    delete state.photoMasks[oldPhoto];
  }
  state.capturedPhotos[idx] = null;
  state.capturedBursts[idx] = null;
  state.processedPhotos[idx] = null;
  state.retakeSlotIndex = idx;
  goToScreen('screen-camera');
  initCameraBooth();
}

function renderFilterButtons() {
  const grid = document.getElementById('filterButtonsGrid');
  grid.innerHTML = '';
  FILTERS.forEach(f => {
    const isSelected = state.selectedFilter.id === f.id;
    const btn = document.createElement('button');
    btn.onclick = () => {
      state.selectedFilter = f;
      renderFilterButtons();
      renderReviewRetakeCards();
      updateReviewCanvas();
    };
    btn.className = `py-2.5 px-3 rounded-xl text-xs font-bold border transition ${
      isSelected
        ? 'bg-brand-600 border-brand-400 text-white shadow'
        : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'
    }`;
    btn.textContent = f.name;
    grid.appendChild(btn);
  });
}

// ==================== OUTPUT & DOWNLOAD ====================
async function finalizeAndGenerateOutputs() {
  showToast('Memproses Full Frame, Live Mode & GIF...', '⏳');
  state.sessionId = 'SB-' + Math.floor(1000 + Math.random() * 9000);
  document.getElementById('sessionCodeDisplay').textContent = '#' + state.sessionId;
  document.getElementById('portalUrlId').textContent = state.sessionId;

  goToScreen('screen-download');

  const activeList = state.processedPhotos.length ? state.processedPhotos : state.capturedPhotos;
  const reviewCanvas = document.getElementById('reviewFrameCanvas');
  await renderCompositeFrameToCanvas(reviewCanvas, activeList);
  state.finalFullFrameDataUrl = reviewCanvas.toDataURL('image/png');
  document.getElementById('finalFullFrameImg').src = state.finalFullFrameDataUrl;
  document.getElementById('portalFullFrameImg').src = state.finalFullFrameDataUrl;

  await buildFilteredSinglePhotos();

  const qrContainer = document.getElementById('downloadQrContainer');
  qrContainer.innerHTML = '';
  const qrTargetUrl = `${window.location.origin}${window.location.pathname}?session=${state.sessionId}`;
  new QRCode(qrContainer, {
    text: qrTargetUrl,
    width: 175,
    height: 175,
    colorDark: '#0f172a',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H
  });

  await buildLiveAndGifOutputs();
}

async function buildFilteredSinglePhotos() {
  state.finalSinglePhotos = [];
  const singleGrid = document.getElementById('singlePhotosGrid');
  const portalGrid = document.getElementById('portalSinglePhotosGrid');
  singleGrid.innerHTML = '';
  portalGrid.innerHTML = '';

  const activeList = state.processedPhotos.length ? state.processedPhotos : state.capturedPhotos;
  for (let i = 0; i < activeList.length; i++) {
    const rawUrl = activeList[i];
    if (!rawUrl) continue;

    const filteredUrl = await applyFilterToSinglePhoto(rawUrl, state.selectedFilter.canvasFilter);
    state.finalSinglePhotos.push(filteredUrl);

    const boothCard = document.createElement('div');
    boothCard.className = 'bg-slate-900 border border-slate-700 rounded-xl p-2 flex flex-col items-center';
    boothCard.innerHTML = `
      <div class="relative w-full aspect-[4/3] rounded-lg overflow-hidden mb-2">
        <img src="${filteredUrl}" class="w-full h-full object-cover" />
        <span class="absolute top-1.5 left-1.5 bg-black/70 text-white text-[10px] font-bold px-2 py-0.5 rounded">Foto #${i + 1}</span>
      </div>
      <button onclick="downloadSinglePhoto(${i})" class="w-full py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-sky-600 text-white text-[11px] font-bold transition">
        ⬇️ Unduh Foto #${i + 1}
      </button>
    `;
    singleGrid.appendChild(boothCard);

    const portalCard = document.createElement('div');
    portalCard.className = 'bg-white border border-sky-100 rounded-xl p-2 flex flex-col items-center shadow-sm';
    portalCard.innerHTML = `
      <div class="relative w-full aspect-[4/3] rounded-lg overflow-hidden mb-2">
        <img src="${filteredUrl}" class="w-full h-full object-cover" />
        <span class="absolute top-1 left-1 bg-slate-900/75 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">#${i + 1}</span>
      </div>
      <button onclick="downloadSinglePhoto(${i})" class="w-full py-1.5 px-2 rounded-lg bg-slate-900 hover:bg-sky-600 text-white text-[11px] font-bold transition">
        ⬇️ Simpan #${i + 1}
      </button>
    `;
    portalGrid.appendChild(portalCard);
  }
}

function applyFilterToSinglePhoto(dataUrl, canvasFilter) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.filter = canvasFilter || 'none';
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.94));
    };
    img.src = dataUrl;
  });
}

async function buildLiveAndGifOutputs() {
  const frameCount = 6;
  const compositeFramesDataUrls = [];
  const tempCanvas = document.createElement('canvas');

  const origW = state.selectedFrame.canvasW;
  const origH = state.selectedFrame.canvasH;
  const scale = 360 / origW;
  const smallFrame = {
    ...state.selectedFrame,
    canvasW: Math.round(origW * scale),
    canvasH: Math.round(origH * scale)
  };

  const savedFrameRef = state.selectedFrame;
  state.selectedFrame = smallFrame;

  for (let f = 0; f < frameCount; f++) {
    const slotSourcesForStep = await Promise.all(
      state.capturedBursts.map(async (burstArr, slotIdx) => {
        if (!burstArr || burstArr.length === 0) {
          return state.processedPhotos[slotIdx] || state.capturedPhotos[slotIdx];
        }
        const burstIdx = Math.min(burstArr.length - 1, Math.floor((f / frameCount) * burstArr.length));
        return await applyBackgroundToSingleImage(burstArr[burstIdx]);
      })
    );
    await renderCompositeFrameToCanvas(tempCanvas, slotSourcesForStep);
    compositeFramesDataUrls.push(tempCanvas.toDataURL('image/jpeg', 0.85));
  }

  state.selectedFrame = savedFrameRef;
  startLiveModeCanvasLoop(compositeFramesDataUrls);

  const spinner = document.getElementById('gifGeneratingSpinner');
  const gifImg = document.getElementById('finalGifImg');
  const gifBtn = document.getElementById('btnDownloadGif');
  spinner.classList.remove('hidden');
  gifImg.classList.add('hidden');
  gifBtn.classList.add('hidden');

  if (typeof gifshot !== 'undefined') {
    gifshot.createGIF({
      images: compositeFramesDataUrls,
      gifWidth: smallFrame.canvasW,
      gifHeight: smallFrame.canvasH,
      interval: 0.22,
      numFrames: compositeFramesDataUrls.length
    }, async function(obj) {
      spinner.classList.add('hidden');
      if (!obj.error) {
        state.finalGifDataUrl = obj.image;
        gifImg.src = obj.image;
        document.getElementById('portalGifImg').src = obj.image;
        gifImg.classList.remove('hidden');
        gifBtn.classList.remove('hidden');
      } else {
        state.finalGifDataUrl = state.finalFullFrameDataUrl;
        gifImg.src = state.finalFullFrameDataUrl;
        gifImg.classList.remove('hidden');
        gifBtn.classList.remove('hidden');
      }

      // Unggah hasil Full Frame, GIF, Foto Satuan & simpan log ke Supabase Cloud
      if (typeof saveSessionToCloud === 'function') {
        showToast('Menyimpan hasil foto ke Cloud untuk QR Code...', '☁️');
        const cloudResult = await saveSessionToCloud({
          sessionCode: state.sessionId,
          frameName: state.selectedFrame.name,
          totalShots: state.selectedFrame.shots,
          price: state.selectedFrame.price,
          paymentMethod: state.paymentMethod || 'qris',
          fullFrameDataUrl: state.finalFullFrameDataUrl,
          gifDataUrl: state.finalGifDataUrl,
          singlePhotos: state.finalSinglePhotos
        });
        if (cloudResult && cloudResult.fullFrameUrl) {
          showToast('Tersimpan di Cloud! QR Code siap di-scan dari HP!', '✅');
        }
      } else {
        showToast('Full Frame, Live Mode & GIF siap diunduh!', '✨');
      }
    });
  }
}

function startLiveModeCanvasLoop(frameUrls) {
  if (state.liveAnimFrameId) cancelAnimationFrame(state.liveAnimFrameId);
  const canvas = document.getElementById('liveModeCanvas');
  const ctx = canvas.getContext('2d');
  const imgs = frameUrls.map(url => {
    const im = new Image();
    im.src = url;
    return im;
  });

  let idx = 0;
  let lastTime = 0;
  function loop(timestamp) {
    if (timestamp - lastTime > 200) {
      lastTime = timestamp;
      const currentImg = imgs[idx];
      if (currentImg && currentImg.complete && currentImg.naturalWidth > 0) {
        canvas.width = currentImg.naturalWidth;
        canvas.height = currentImg.naturalHeight;
        ctx.drawImage(currentImg, 0, 0);
      }
      idx = (idx + 1) % imgs.length;
    }
    state.liveAnimFrameId = requestAnimationFrame(loop);
  }
  state.liveAnimFrameId = requestAnimationFrame(loop);
}

function switchOutputTab(tabName) {
  ['fullframe', 'livemode', 'gif', 'single'].forEach(t => {
    const btn = document.getElementById(`tab-${t}`);
    const view = document.getElementById(`view-${t}`);
    if (t === tabName) {
      btn.className = 'output-tab py-2.5 px-2.5 rounded-xl bg-brand-600 text-white font-bold text-xs transition';
      view.classList.remove('hidden');
      view.classList.add('flex');
    } else {
      btn.className = 'output-tab py-2.5 px-2.5 rounded-xl text-slate-400 hover:text-white font-bold text-xs transition';
      view.classList.add('hidden');
      view.classList.remove('flex');
    }
  });
}

function triggerBrowserDownload(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function downloadFullFrame() {
  if (!state.finalFullFrameDataUrl) return;
  triggerBrowserDownload(state.finalFullFrameDataUrl, `SnapBooth-${state.sessionId}-FullFrame.png`);
  showToast('Mengunduh Full Frame (.PNG)...', '⬇️');
}

function downloadSinglePhoto(index) {
  const url = state.finalSinglePhotos[index];
  if (!url) return;
  triggerBrowserDownload(url, `SnapBooth-${state.sessionId}-Foto-${index + 1}.jpg`);
  showToast(`Mengunduh Foto Satuan #${index + 1} (.JPG)...`, '📸');
}

function downloadAllSinglePhotos() {
  if (!state.finalSinglePhotos.length) return;
  state.finalSinglePhotos.forEach((url, idx) => {
    setTimeout(() => {
      triggerBrowserDownload(url, `SnapBooth-${state.sessionId}-Foto-${idx + 1}.jpg`);
    }, idx * 250);
  });
  showToast(`Mengunduh ${state.finalSinglePhotos.length} foto satuan...`, '⬇️');
}

function downloadGifFile() {
  const url = state.finalGifDataUrl || state.finalFullFrameDataUrl;
  if (!url) return;
  triggerBrowserDownload(url, `SnapBooth-${state.sessionId}-Animasi.gif`);
  showToast('Mengunduh Animasi (.GIF)...', '⬇️');
}

function downloadLiveVideo() {
  const canvas = document.getElementById('liveModeCanvas');
  if (!canvas || typeof canvas.captureStream !== 'function') {
    downloadGifFile();
    return;
  }
  showToast('Merekam file video Live Mode (.WEBM)...', '🎬');
  try {
    const stream = canvas.captureStream(15);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks = [];
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      triggerBrowserDownload(url, `SnapBooth-${state.sessionId}-LiveMode.webm`);
      showToast('Live Mode Video berhasil diunduh!', '✅');
    };
    recorder.start();
    setTimeout(() => recorder.stop(), 2400);
  } catch (e) {
    downloadGifFile();
  }
}

function openCustomerMobilePortal() {
  document.getElementById('customerPortalModal').classList.remove('hidden');
  document.getElementById('customerPortalModal').classList.add('flex');
}

function closeCustomerMobilePortal() {
  document.getElementById('customerPortalModal').classList.add('hidden');
  document.getElementById('customerPortalModal').classList.remove('flex');
}

function resetSessionForNextCustomer() {
  if (state.liveAnimFrameId) cancelAnimationFrame(state.liveAnimFrameId);
  state.capturedPhotos = [];
  state.capturedBursts = [];
  state.processedPhotos = [];
  state.photoMasks = {};
  state.camBgMode = 'none';
  state.retakeSlotIndex = null;
  document.getElementById('frameCaptionInput').value = '';
  goToScreen('screen-welcome');
  showToast('Siap untuk pelanggan berikutnya!', '👋');
}