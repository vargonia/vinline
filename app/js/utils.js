// vinline — pure helpers
function isAuthExpired(res) { return res && res.status === 401; }
function pdfToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Resize photo invoices to max 2048px (cuts cost + latency), reject HEIC
function imageToBase64(file, maxPx = 2048) {
  return new Promise((resolve, reject) => {
    const type = file.type || '';
    const name = (file.name || '').toLowerCase();
    if (type === 'image/heic' || type === 'image/heif' || name.endsWith('.heic') || name.endsWith('.heif')) {
      return reject(new Error('HEIC format not supported by Claude. In Photos, tap Share → Save as JPEG, then upload that file.'));
    }
    const img = new Image();
    const blobUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(blobUrl);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      if (scale === 1 && (type === 'image/jpeg' || type === 'image/png' || type === 'image/webp')) {
        const reader = new FileReader();
        reader.onload = () => resolve({ base64: reader.result.split(',')[1], mediaType: type });
        reader.onerror = reject;
        reader.readAsDataURL(file);
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve({ base64: canvas.toDataURL('image/jpeg', 0.92).split(',')[1], mediaType: 'image/jpeg' });
    };
    img.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error('Could not read image file.')); };
    img.src = blobUrl;
  });
}

// ─── UTILS ────────────────────────────────────────────────────────────────────

function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function formatDate(d) {
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diff = now - d;
  if (diff < 86400000 && now.getDate()===d.getDate()) return 'Today ' + d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
  if (diff < 172800000) return 'Yesterday';
  return d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
}
export { isAuthExpired, pdfToBase64, imageToBase64, esc, formatDate };
