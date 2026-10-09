/**
 * Deteksi OS untuk teks yang ditampilkan ke pengguna.
 *
 * KENAPA ADA FILE INI:
 * RigDeck dikembangkan di Linux (CachyOS), tapi juga jalan di Windows.
 * Beberapa teks dulu di-hardcode "Linux CachyOS" — jadi salah waktu
 * dibuka di Windows. Sudah diperbaiki 9 Okt 2026.
 *
 * ATURAN: jangan hardcode nama OS di komponen. Pakai `namaOS` dari sini.
 *
 * Catatan: ini HANYA untuk teks tampilan. Untuk memilih perintah
 * yang dijalankan, itu ada di sisi Rust (`#[cfg(target_os)]`), bukan di sini.
 */

/** Nama OS yang enak dibaca, untuk ditampilkan di UI. */
export const namaOS: string = (() => {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';

  if (/Windows/i.test(ua)) return 'Windows';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS';
  if (/Android/i.test(ua)) return 'Android';

  // Linux: coba sebutkan distro-nya kalau bisa dideteksi dari UA.
  // Chrome di Linux biasanya menyertakan "Linux x86_64", bukan nama distro.
  if (/Linux/i.test(ua)) {
    // CachyOS/Arch sering tidak muncul di UA. Kalau tidak ada, tulis "Linux".
    const m = ua.match(/(CachyOS|Arch|Ubuntu|Fedora|Debian|Manjaro|Mint|openSUSE)/i);
    return m ? m[1] : 'Linux';
  }

  return 'Desktop';
})();

/** Nama OS untuk label singkat (mis. di badge). */
export const osSingkat: string = namaOS.split(' ')[0];

/** Apakah sedang jalan di Windows? Untuk menyembunyikan tombol yang khusus Linux. */
export const diWindows: boolean = namaOS === 'Windows';
