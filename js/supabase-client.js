// Konfigurasi Koneksi Supabase - Studio by Zachra
const SUPABASE_URL = 'https://kozbjkxmbdyflzdyvdle.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable__Gj9ZtXVciMMwE9KwW1MqA_k0rveCdU';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// Helper mengubah DataURL (Base64) menjadi Blob untuk diunggah ke Storage
function dataURLToBlob(dataURL) {
  const parts = dataURL.split(';base64,');
  const contentType = parts[0].split(':')[1];
  const raw = window.atob(parts[1]);
  const rawLength = raw.length;
  const uInt8Array = new Uint8Array(rawLength);
  for (let i = 0; i < rawLength; ++i) {
    uInt8Array[i] = raw.charCodeAt(i);
  }
  return new Blob([uInt8Array], { type: contentType });
}

// Upload 1 file ke Supabase Storage Bucket 'photobooth-results'
async function uploadFileToSupabase(fileBlob, filePath, contentType) {
  const { error } = await supabaseClient.storage
    .from('photobooth-results')
    .upload(filePath, fileBlob, {
      contentType: contentType,
      upsert: true
    });

  if (error) {
    console.error('Gagal upload ke Supabase Storage:', error);
    return null;
  }

  const { data } = supabaseClient.storage
    .from('photobooth-results')
    .getPublicUrl(filePath);

  return data.publicUrl;
}

// Simpan seluruh hasil sesi (Full Frame, GIF, Foto Satuan) & catat transaksi ke Database
async function saveSessionToCloud(sessionData) {
  try {
    const code = sessionData.sessionCode.replace('#', '').trim();
    const folder = `sessions/${code}`;

    // 1. Upload Full Frame PNG
    let fullFrameUrl = null;
    if (sessionData.fullFrameDataUrl) {
      const frameBlob = dataURLToBlob(sessionData.fullFrameDataUrl);
      fullFrameUrl = await uploadFileToSupabase(frameBlob, `${folder}/fullframe.png`, 'image/png');
    }

    // 2. Upload Animasi GIF (jika tersedia)
    let gifUrl = null;
    if (sessionData.gifDataUrl && sessionData.gifDataUrl.startsWith('data:image/gif')) {
      const gifBlob = dataURLToBlob(sessionData.gifDataUrl);
      gifUrl = await uploadFileToSupabase(gifBlob, `${folder}/animasi.gif`, 'image/gif');
    }

    // 3. Upload Foto Satuan
    const singleUrls = [];
    if (Array.isArray(sessionData.singlePhotos)) {
      for (let i = 0; i < sessionData.singlePhotos.length; i++) {
        const photoBlob = dataURLToBlob(sessionData.singlePhotos[i]);
        const url = await uploadFileToSupabase(photoBlob, `${folder}/pose-${i + 1}.jpg`, 'image/jpeg');
        if (url) singleUrls.push(url);
      }
    }

    // 4. Simpan log transaksi ke tabel 'sessions'
    const { error: dbError } = await supabaseClient
      .from('sessions')
      .insert([{
        session_code: sessionData.sessionCode,
        frame_name: sessionData.frameName,
        total_shots: sessionData.totalShots,
        price: sessionData.price,
        payment_method: sessionData.paymentMethod || 'QRIS',
        full_frame_url: fullFrameUrl,
        gif_url: gifUrl,
        single_photos_urls: singleUrls
      }]);

    if (dbError) {
      console.error('Gagal menyimpan riwayat sesi ke database:', dbError);
    }

    return {
      fullFrameUrl,
      gifUrl,
      singleUrls
    };
  } catch (err) {
    console.error('Error sinkronisasi cloud:', err);
    return null;
  }
}

// Ambil pengaturan studio dari database saat halaman dimuat
async function loadStudioSettingsFromCloud() {
  try {
    const { data, error } = await supabaseClient
      .from('studio_settings')
      .select('*')
      .eq('id', 1)
      .single();

    if (!error && data) {
      return data;
    }
  } catch (e) {
    console.warn('Menggunakan pengaturan lokal default.');
  }
  return null;
}