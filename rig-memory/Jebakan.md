# Jebakan

Hal yang sudah pernah bikin rugi di proyek RigDeck ini. **Baca sebelum mengubah kode.**
Tambahkan entri baru di bawah, jangan hapus yang lama.
Bagian dari [[README|protokol kerja bersama]]. State proyek ada di [[Handoff]].

---

## 1. WebKitGTK / Linux URL Length Limit (~2.048 Karakter)

**Gejala:** Deep-link `claude://claude.ai/new?q=...` gagal dibuka oleh OS atau terpotong jika membawa spesifikasi RFC yang panjang (>2KB).

**Sebab:** Handler URL scheme di Linux WebKitGTK memiliki buffer batas aman ~2.048 byte.

**Solusi:** Gunakan **Pointer Context File Pattern**:
1. Tulis spesifikasi lengkap ke file lokal `.rig/context/current_task.json`.
2. Kirim URL deep-link pendek yang menyuruh Claude membaca file tersebut:
   `claude://claude.ai/new?q=RigDeck%20Mission%20Control%3A%20Baca%20rig-memory%2F00-INDEX.md...`

---

## 2. Window Title Berubah-ubah di Claude Desktop (Gunakan `StartupWMClass`)

**Gejala:** `wmctrl -a Claude` gagal memfokuskan jendela ketika user sedang membuka chat dengan judul topik spesifik.

**Sebab:** Judul jendela (window title) Claude Desktop di Linux bersifat dinamis mengikuti percakapan aktif.

**Solusi:** Gunakan parameter `-x` di `wmctrl` untuk mencocokkan `StartupWMClass` resmi:
```rust
Command::new("wmctrl")
    .args(["-x", "-a", "com.anthropic.Claude"])
    .output();
```

---

## 3. 9Router Merespons dalam Format SSE Streaming (`data: {...}`)

**Gejala:** `fetch('/v1/chat/completions')` dengan `response.json()` melempar error parse JSON.

**Sebab:** 9Router mengirimkan response dalam format Server-Sent Events (SSE) baris demi baris (`data: {"choices":...}`) meskipun `stream: false`.

**Solusi:** Parser di `src/services/conductorAi.ts` harus membaca `response.text()` terlebih dahulu dan mengekstrak blok `data: ` per baris.

---

## 4. Git Worktree Add Gagal Jika Path Sudah Ada

**Gejala:** `git worktree add -b rig/feat-impl .rig/worktrees/feat-impl` melempar error "already exists".

**Solusi:** Periksa apakah folder `.rig/worktrees/<branch>` sudah ada sebelum memanggil git worktree add. Jika sudah ada, langsung gunakan path tersebut.

---

## 5. Deep-Link `claude://claude.ai/new` Membuka Cowork Tab (Bukan Code Tab)

**Gejala:** Menekan tombol "Send Spec" membuka percakapan baru di tab Cowork (`claude.ai/new`) alih-alih melanjutkan sesi di tab Code.

**Sebab:** Skema URL `claude://claude.ai/new` mengarah ke web interface / Cowork mode dan memaksa pembuatan percakapan baru (`/new`).

**Solusi:** Gunakan deep-link `claude://code/continue?session=last&source=rigdeck` agar Claude Desktop tetap berada di tab Code pada sesi aktif yang sedang berjalan.

---

## 6. `navigator.clipboard` di WebKitGTK Gagal Saat Jendela Tidak Fokus

**Gejala:** Saat memanggil `wmctrl` untuk memfokuskan jendela tujuan, `navigator.clipboard.writeText(...)` di Tauri Webview diam-diam gagal karena dokumen kehilangan fokus sebelum penulisan selesai ("ga muncul apa-apa").

**Solusi:** Gunakan backend bridge OS-level (`gui_inject.py`) yang:
1. Mengisi OS clipboard langsung via GTK/GDK (baik `CLIPBOARD` maupun `PRIMARY`).
2. Memfokuskan jendela tujuan via `wmctrl`.
3. Menginjeksi penekanan tombol `Ctrl+V` (dan Enter jika auto-submit) via X11 `libXtst` sehingga prompt langsung tertempel dan muncul di composer chat tujuan.

---

## 7. WebKitGTK Black / Blank Window Karena Vite Bind ke IPv6 `::1`

**Gejala:** Jendela RigDeck terbuka tetapi layarnya hitam legam / blank kosong tanpa UI (`about:blank`).

**Sebab:** Di Vite v6 (Linux), jika `server.host` tidak disetel, Vite hanya mengikat port ke IPv6 `[::1]:1420`. Sementara WebKitGTK di Tauri mencoba menghubungi `http://localhost:1420` via IPv4 (`127.0.0.1:1420`) sehingga mendapatkan error *Connection refused*, lalu memuat `about:blank`.

**Solusi:**
1. Di `vite.config.ts`, wajib set `server.host: "0.0.0.0"`.
2. Di `src-tauri/tauri.conf.json`, gunakan `devUrl: "http://127.0.0.1:1420"` agar tidak ada ambiguitas resolusi DNS localhost.




---

## Jebakan: file `.bat` pakai LF, bukan CRLF

**Gejala:** Dobel-klik `run-windows.bat` → jendela CMD muncul **0 detik**
lalu langsung hilang. Tidak ada pesan error sama sekali.

**Sebab:** File `.bat` disimpan dengan line ending **LF** (Unix),
padahal `cmd.exe` Windows butuh **CRLF**.

```
$ python -c "d=open('run-windows.bat','rb').read(); print(d.count(b'\r\n'))"
0        ← tidak ada CRLF sama sekali
```

Windows membaca seluruh file sebagai satu baris aneh → perintah pertama
tidak dikenali → langsung keluar.

**Perbaikan:** ubah ke CRLF.

```bash
python -c "p='run-windows.bat'; d=open(p,'rb').read(); open(p,'wb').write(d.replace(b'\r\n',b'\n').replace(b'\n',b'\r\n'))"
```

**Pencegahan:** tambahkan di `.gitattributes`:

```
*.bat text eol=crlf
*.cmd text eol=crlf
```

Tanpa ini, tiap kali file di-commit dari Linux/Mac, line ending-nya
kembali jadi LF dan bug ini muncul lagi.

---

## Jebakan: `%ERRORLEVEL%` di dalam blok `if (...)`

**Gejala:** `.bat` gagal dengan pesan samar:
```
... was unexpected at this time.
```

**Sebab:** `%ERRORLEVEL%` di dalam blok `if (...)` dievaluasi
**saat blok dibaca**, bukan saat dijalankan. Jadi nilainya selalu
dari perintah **sebelum** blok itu — bukan dari `where bun` di dalamnya.

```bat
rem SALAH - selalu salah nilai
where bun >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo ada bun
)
```

**Perbaikan:** dua cara.

```bat
rem CARA 1 (paling sederhana) - cek langsung
where bun >nul 2>&1
if not errorlevel 1 set RUNNER=bun

rem CARA 2 - pakai delayed expansion
setlocal enabledelayedexpansion
where bun >nul 2>&1
set HASBUN=!ERRORLEVEL!
if "!HASBUN!"=="0" echo ada bun
```

**Cara 1 lebih baik** — tidak perlu `setlocal`, lebih mudah dibaca.

**Pelajaran umum:** di `.bat`, hindari `%VAR%` di dalam blok `if (...)`
atau `for (...)`. Pakai `!VAR!` dengan `setlocal enabledelayedexpansion`,
atau restrukturisasi supaya tidak perlu blok.

---

## Jebakan: teks "Linux CachyOS" di-hardcode

**Gejala:** Aplikasi dibuka di Windows, tapi tertulis "Linux CachyOS".
Teks di terminal PTY juga bilang "Linux CachyOS PTY Terminal Ready".

**Sebab:** Nama OS ditulis langsung di kode:
```
src/App.tsx:268          "RigDeck Desktop Orchestrator • Linux CachyOS"
src/components/TerminalGrid.tsx:118   "| Linux CachyOS PTY Terminal Ready"
```

**Perbaikan:** buat `src/lib/platform.ts` yang mendeteksi OS dari
`navigator.userAgent`, lalu pakai variabel `namaOS`.

**Aturan:** **Jangan hardcode nama OS di komponen.** Pakai `namaOS`.

---

## Jebakan: perintah `date` tidak ada di Windows

**Gejala:** Nama file journal jadi `journal/unknown.md`, bukan
`journal/2026-10-09.md`.

**Sebab:** `src-tauri/src/memory.rs` memanggil perintah shell `date`:
```rust
Command::new("date").arg("+%Y-%m-%d")
```
`date` itu perintah Linux. Di Windows gagal → jatuh ke fallback
`unwrap_or_else(|| "unknown".to_string())`.

**Perbaikan:** pakai `std::time::SystemTime` dari Rust std.
Jalan di dua OS, tanpa spawn proses, tanpa crate tambahan.

```rust
let detik = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();
// lalu hitung (tahun, bulan, hari) dari detik
```

**Aturan:** untuk tanggal/jam, **jangan pakai perintah shell**.
Pakai `std::time` (Rust) atau `Date` (JS) — dua-duanya jalan di semua OS.

**Pelajaran umum:** perintah shell itu spesifik OS. Kalau harus pakai,
bungkus dengan `#[cfg(target_os)]`. Kalau bisa dihindari, hindari.
