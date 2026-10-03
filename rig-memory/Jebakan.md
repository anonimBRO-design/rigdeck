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
