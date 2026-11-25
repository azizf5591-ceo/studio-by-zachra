// Inisialisasi MediaPipe Selfie Segmentation untuk ganti background pasca-foto
function initSelfieSegmenter() {
  if (state.segmenter || typeof SelfieSegmentation === 'undefined') return state.segmenter;
  state.segmenter = new SelfieSegmentation({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
  });
  state.segmenter.setOptions({ modelSelection: 1 });
  return state.segmenter;
}

function getPersonMaskFromImage(img) {
  state.segQueue = state.segQueue.then(() => new Promise(resolve => {
    const seg = initSelfieSegmenter();
    if (!seg) return resolve(null);

    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, 4000);

    seg.onResults(results => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const mc = document.createElement('canvas');
      mc.width = img.width;
      mc.height = img.height;
      mc.getContext('2d').drawImage(results.segmentationMask, 0, 0, mc.width, mc.height);
      resolve(mc);
    });

    seg.send({ image: img }).catch(() => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(null);
      }
    });
  }));
  return state.segQueue;
}

async function applyBackgroundToSingleImage(dataUrl) {
  if (!dataUrl || state.camBgMode === 'none') return dataUrl;
  return new Promise(resolve => {
    const img = new Image();
    img.onload = async () => {
      let mask = state.photoMasks[dataUrl];
      if (!mask) {
        mask = await getPersonMaskFromImage(img);
        if (mask) state.photoMasks[dataUrl] = mask;
      }
      if (!mask) return resolve(dataUrl);

      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d');

      ctx.drawImage(mask, 0, 0, c.width, c.height);
      ctx.globalCompositeOperation = 'source-in';
      ctx.drawImage(img, 0, 0, c.width, c.height);

      ctx.globalCompositeOperation = 'destination-over';
      if (state.camBgMode === 'blur') {
        ctx.filter = 'blur(16px)';
        ctx.drawImage(img, 0, 0, c.width, c.height);
        ctx.filter = 'none';
      } else if (state.camBgMode === 'image' && state.camBgCustomImg) {
        drawImageCover(ctx, state.camBgCustomImg, 0, 0, c.width, c.height);
      }
      resolve(c.toDataURL('image/jpeg', 0.92));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function rebuildProcessedPhotosWithBackground() {
  if (state.camBgMode === 'none') {
    state.processedPhotos = [...state.capturedPhotos];
  } else {
    showToast('Menerapkan virtual background...', '🌄');
    const results = [];
    for (let i = 0; i < state.capturedPhotos.length; i++) {
      results.push(await applyBackgroundToSingleImage(state.capturedPhotos[i]));
    }
    state.processedPhotos = results;
  }
  renderReviewRetakeCards();
  await updateReviewCanvas();
}

async function selectReviewBackground(mode, value, btnEl) {
  state.camBgMode = mode;
  state.camBgValue = value;
  document.querySelectorAll('.cam-bg-btn').forEach(b => b.classList.remove('ring-2', 'ring-white'));
  if (btnEl) btnEl.classList.add('ring-2', 'ring-white');
  await rebuildProcessedPhotosWithBackground();
}

function selectPresetReviewBackground(src, btnEl) {
  const img = new Image();
  img.onload = async () => {
    state.camBgCustomImg = img;
    await selectReviewBackground('image', src, btnEl);
  };
  img.onerror = () => showToast(`File ${src} tidak ditemukan di folder`, '⚠️');
  img.src = src;
}

function handleCustomCamBgUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = async () => {
      state.camBgCustomImg = img;
      await selectReviewBackground('image', null, null);
      showToast('Background kustom berhasil diterapkan!', '🌄');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ==================== WEBCAM & CAPTURE ====================
async function initCameraBooth() {
  updateCameraUIProgress();
  if (state.isSimulatedCam) {
    startSimulatedCamera();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 960 }, facingMode: 'user' },
      audio: false
    });
    state.stream = stream;
    const video = document.getElementById('webcamVideo');
    video.srcObject = stream;
    video.classList.remove('hidden');
    document.getElementById('simCameraCanvas').classList.add('hidden');
  } catch (err) {
    showToast('Kamera tidak terdeteksi, beralih ke Mode Simulasi Virtual', '🎭');
    state.isSimulatedCam = true;
    startSimulatedCamera();
  }
}

function stopCameraStream() {
  if (state.stream) {
    state.stream.getTracks().forEach(t => t.stop());
    state.stream = null;
  }
  if (state.simAnimId) {
    cancelAnimationFrame(state.simAnimId);
    state.simAnimId = null;
  }
}

function toggleMirror() {
  state.isMirrored = !state.isMirrored;
  const video = document.getElementById('webcamVideo');
  video.style.transform = state.isMirrored ? 'scaleX(-1)' : 'scaleX(1)';
  document.getElementById('btnMirror').innerHTML = `<span>🪞 Mirror: ${state.isMirrored ? 'ON' : 'OFF'}</span>`;
}

function toggleSimulatedCamera() {
  state.isSimulatedCam = !state.isSimulatedCam;
  if (state.isSimulatedCam) {
    stopCameraStream();
    startSimulatedCamera();
    showToast('Mode Kamera Simulasi Aktif', '🎭');
  } else {
    if (state.simAnimId) cancelAnimationFrame(state.simAnimId);
    initCameraBooth();
  }
}

function startSimulatedCamera() {
  const video = document.getElementById('webcamVideo');
  const canvas = document.getElementById('simCameraCanvas');
  video.classList.add('hidden');
  canvas.classList.remove('hidden');
  canvas.width = 800;
  canvas.height = 600;
  const ctx = canvas.getContext('2d');

  let t = 0;
  const emojis = ['✌️', '😎', '🥳', '🤩', '💖', '📸'];
  function drawSim() {
    t += 0.04;
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, '#1e1b4b');
    grad.addColorStop(0.5, '#831843');
    grad.addColorStop(1, '#312e81');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(
        400 + Math.cos(t + i) * 220,
        300 + Math.sin(t * 1.3 + i) * 140,
        40 + i * 10,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = 'rgba(244, 114, 182, 0.18)';
      ctx.fill();
    }

    const bounceY = Math.sin(t * 3) * 14;
    ctx.font = '140px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const emojiIdx = Math.floor(t / 2) % emojis.length;
    ctx.fillText(emojis[emojiIdx], canvas.width / 2, canvas.height / 2 + bounceY);

    ctx.font = 'bold 20px Plus Jakarta Sans, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('VIRTUAL STUDIO CAMERA', canvas.width / 2, canvas.height - 45);

    state.simAnimId = requestAnimationFrame(drawSim);
  }
  drawSim();
}

function getTargetSlotIndex() {
  if (state.retakeSlotIndex !== null) return state.retakeSlotIndex;
  return state.capturedPhotos.findIndex(p => p === null);
}

function updateCameraUIProgress() {
  const total = state.selectedFrame.shots;
  const filled = state.capturedPhotos.filter(p => p !== null).length;
  const targetIdx = getTargetSlotIndex();

  document.getElementById('slotProgressBadge').textContent = `${filled} / ${total} Terisi`;
  if (state.retakeSlotIndex !== null) {
    document.getElementById('cameraModeBadge').textContent = 'MODE RETAKE FOTO';
    document.getElementById('cameraShotCounterText').textContent = `Mengulang Pose ke-${state.retakeSlotIndex + 1}`;
  } else {
    document.getElementById('cameraModeBadge').textContent = 'SESI PEMOTRETAN';
    const currentNum = targetIdx === -1 ? total : targetIdx + 1;
    document.getElementById('cameraShotCounterText').textContent = `Pose ${currentNum} dari ${total}`;
  }

  const container = document.getElementById('cameraSlotsPreview');
  container.innerHTML = '';
  state.capturedPhotos.forEach((photoUrl, idx) => {
    const div = document.createElement('div');
    const isCurrent = idx === targetIdx;
    div.className = `aspect-[4/3] rounded-xl overflow-hidden border-2 flex items-center justify-center relative ${
      isCurrent ? 'border-brand-500 bg-brand-500/10' : 'border-slate-700 bg-slate-900'
    }`;
    if (photoUrl) {
      div.innerHTML = `
        <img src="${photoUrl}" class="w-full h-full object-cover" />
        <span class="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">#${idx + 1}</span>
      `;
    } else {
      div.innerHTML = `<span class="text-xs font-bold ${isCurrent ? 'text-brand-400' : 'text-slate-600'}">Pose ${idx + 1}</span>`;
    }
    container.appendChild(div);
  });
}

function startCountdownCapture() {
  if (state.isCapturing) return;
  const slotIdx = getTargetSlotIndex();
  if (slotIdx === -1) return;

  state.isCapturing = true;
  const btn = document.getElementById('btnCapture');
  btn.disabled = true;
  btn.classList.add('opacity-50', 'cursor-not-allowed');

  const overlay = document.getElementById('countdownOverlay');
  const numEl = document.getElementById('countdownNumber');
  const liveBadge = document.getElementById('liveRecBadge');

  overlay.classList.remove('hidden');
  liveBadge.classList.remove('hidden');

  let count = 3;
  numEl.textContent = count;
  playBeepSound(520, 0.12);

  const burstFrames = [];
  const burstInterval = setInterval(() => {
    burstFrames.push(grabCurrentVideoFrame(480, 360));
  }, 250);

  const countdownTimer = setInterval(() => {
    count--;
    if (count > 0) {
      numEl.textContent = count;
      playBeepSound(520, 0.12);
    } else {
      clearInterval(countdownTimer);
      clearInterval(burstInterval);
      overlay.classList.add('hidden');
      liveBadge.classList.add('hidden');

      triggerCameraFlash();
      playShutterSound();
      const finalShot = grabCurrentVideoFrame(960, 720);
      burstFrames.push(finalShot);

      state.capturedPhotos[slotIdx] = finalShot;
      state.capturedBursts[slotIdx] = burstFrames.slice(-10);

      state.isCapturing = false;
      btn.disabled = false;
      btn.classList.remove('opacity-50', 'cursor-not-allowed');

      if (state.retakeSlotIndex !== null) {
        state.retakeSlotIndex = null;
        updateCameraUIProgress();
        setTimeout(() => openReviewScreen(), 450);
      } else {
        updateCameraUIProgress();
        const nextEmpty = state.capturedPhotos.findIndex(p => p === null);
        if (nextEmpty === -1) {
          setTimeout(() => openReviewScreen(), 550);
        }
      }
    }
  }, 1000);
}

function grabCurrentVideoFrame(targetW, targetH) {
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = targetW;
  tempCanvas.height = targetH;
  const ctx = tempCanvas.getContext('2d');

  if (state.isSimulatedCam) {
    const simCanvas = document.getElementById('simCameraCanvas');
    ctx.drawImage(simCanvas, 0, 0, targetW, targetH);
  } else {
    const video = document.getElementById('webcamVideo');
    if (state.isMirrored) {
      ctx.translate(targetW, 0);
      ctx.scale(-1, 1);
    }
    const vw = video.videoWidth || 800;
    const vh = video.videoHeight || 600;
    const targetRatio = targetW / targetH;
    const videoRatio = vw / vh;
    let sx = 0, sy = 0, sw = vw, sh = vh;
    if (videoRatio > targetRatio) {
      sw = vh * targetRatio;
      sx = (vw - sw) / 2;
    } else {
      sh = vw / targetRatio;
      sy = (vh - sh) / 2;
    }
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, targetW, targetH);
  }
  return tempCanvas.toDataURL('image/jpeg', 0.9);
}

function triggerCameraFlash() {
  const flash = document.getElementById('cameraFlash');
  flash.classList.remove('animate-flash');
  void flash.offsetWidth;
  flash.classList.add('animate-flash');
}

function playBeepSound(freq = 520, duration = 0.12) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {}
}

function playShutterSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    const bufferSize = ctx.sampleRate * 0.12;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.03));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.connect(ctx.destination);
    noise.start();
  } catch (e) {}
}