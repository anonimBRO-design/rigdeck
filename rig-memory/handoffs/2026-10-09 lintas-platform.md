# Handoff — RigDeck Lintas Platform (CachyOS + Windows)

**Dari:** Claude Code · **Untuk:** Antigravity, Master Conductor, ChatGPT
**Tanggal:** 9 Oktober 2026
**Status:** RENCANA — belum ada kode yang diubah

Bagian dari [[README|protokol]] · Jebakan: [[Jebakan]] · Keputusan: [[02-Decisions]]

---

## Yang diminta

> *"aku ingin rigdeck bisa dipakai di cachy os ku dan di windows"*

Saat ini RigDeck **hanya jalan di Linux**. Beberapa perintahnya
(`wmctrl`, `xdg-open`, `gtk-launch`, `zenity`) tidak ada di Windows.

Tujuan: **satu basis kode, jalan di dua OS.**

---

## Kondisi sekarang

### Kode yang spesifik OS

| File | Perintah | OS | Masalah di Windows |
|---|---|---|---|
| `app_bridge.rs` | `wmctrl` | Linux | tidak ada |
| `app_bridge.rs` | `gtk-launch` | Linux | tidak ada |
| `app_bridge.rs` | `powershell` | Windows | ✅ sudah ada |
| `lib.rs` | `zenity` | Linux | tidak ada |
| `lib.rs` | `powershell` | Windows | ✅ sudah ada |
| `memory.rs` | `date` | Linux | tidak ada |
| `pty.rs` | `where` / `bash` | campur | perlu dicek |
| `router_client.rs` | `curl` | dua-duanya | ✅ ada di dua OS |

**Catatan:** `app_bridge.rs` sudah **setengah** mendukung Windows —
ada cabang PowerShell. Tapi cabang Linux-nya masih dominan.

---

## Rencana

### Prinsip: satu pintu, dua pintu belakang

**Jangan** menaruh `if windows { ... } else { ... }` di banyak tempat.
Itu bikin kode susah dibaca dan gampang lupa.

**Lakukan:** buat satu modul `platform/` yang menangani semua perbedaan.

```
src-tauri/src/
├── platform/
│   ├── mod.rs        ← pilih implementasi sesuai OS
│   ├── linux.rs      ← wmctrl, gtk-launch, zenity
│   └── windows.rs    ← PowerShell, Win32 API
├── app_bridge.rs     ← panggil platform::*, tanpa if-OS
└── ...
```

**Hasilnya:** `app_bridge.rs` jadi bersih, tidak peduli OS.

### Tiga hal yang harus di-port

| # | Fungsi | Linux | Windows |
|---|---|---|---|
| 1 | **Fokus jendela app** | `wmctrl -x -a <class>` | PowerShell + Win32 `SetForegroundWindow` |
| 2 | **Pilih file/folder** | `zenity --file-selection` | Tauri dialog plugin |
| 3 | **Waktu sekarang** | `date` | `std::time::SystemTime` (dua OS) |

**Nomor 3 paling mudah** — jangan pakai `date` sama sekali, pakai Rust
`std::time`. Jalan di dua OS tanpa kode tambahan.

**Nomor 2:** Tauri punya plugin dialog resmi. Pakai itu, bukan `zenity`.
Jalan di dua OS, dan tidak perlu spawn proses.

**Nomor 1 paling berat** — fokus jendela itu beda total di dua OS.

---

## Cara memverifikasi (jangan pakai tebakan)

Tiap perubahan harus dites di **dua OS**. Tulis hasilnya di journal.

```
Linux (CachyOS):
  cargo check
  cargo test
  → fokus jendela Claude, Antigravity, ChatGPT

Windows:
  cargo check
  cargo test
  → fokus jendela Claude, Antigravity, ChatGPT
```

**Jangan bilang "selesai"** kalau baru dites di satu OS.

---

## Yang perlu diputuskan

| # | Pertanyaan | Siapa yang jawab |
|---|---|---|
| 1 | CachyOS pakai Wayland atau X11? | Afgan |
| 2 | Antigravity di Linux ada versi desktop? | Antigravity |
| 3 | Perlu adapter CLI (`claude`/`agy` headless)? | Master Conductor |

**Kenapa nomor 1 penting:** `wmctrl` **tidak jalan di Wayland**.
Kalau CachyOS pakai Wayland, perlu cara lain (`ydotool`, atau
ekstensi GNOME/KDE). Ini bisa mengubah seluruh rencana.

---

## Temuan tambahan (9 Okt 2026)

### Kedua CLI jalan headless

```
claude -p "<prompt>" --output-format stream-json --verbose   → OK
agy    -p "<prompt>" --output-format stream-json             → OK
```

**`claude` butuh 3 env var** dari `~/.claude/settings.json`:
```
ANTHROPIC_BASE_URL=https://api.rindri.com
ANTHROPIC_AUTH_TOKEN=sk-rindri-...
ANTHROPIC_DEFAULT_HAIKU_MODEL=claude-haiku-4-5
```

Tanpa itu → `Not logged in`.

### Format stream-json keduanya BERBEDA

```
claude : {"type":"assistant","message":{"content":[{"type":"text",...}]}}
agy    : {"event":"step_update","step_update":{"state":"DONE",...}}
```

**Butuh lapisan penerjemah.** Prototipe ada di
`prototipe/adapter.js` (belum diuji penuh).

---

## Urutan pengerjaan yang disarankan

| # | Langkah | Kenapa duluan |
|---|---|---|
| 1 | Jawab 3 pertanyaan di atas | Salah jawab = salah arah |
| 2 | Buat `platform/` modul | Fondasi |
| 3 | Port "waktu sekarang" | Paling mudah, untuk uji alur |
| 4 | Port "pilih file" pakai plugin Tauri | Sedang |
| 5 | Port "fokus jendela" | Paling berat |
| 6 | Uji di dua OS | Wajib |

**Jangan kerjakan 2-6 sekaligus.** Satu langkah, uji, baru lanjut.

---

## Yang TIDAK boleh dilakukan

- ❌ Taruh `#[cfg(windows)]` tersebar di banyak file
- ❌ Pakai `date`, `wmctrl`, `zenity` — tidak ada di Windows
- ❌ Bilang "selesai" tanpa uji dua OS
- ❌ Hapus cabang PowerShell yang sudah ada di `app_bridge.rs`

---

## Catatan untuk agent berikutnya

**Baca [[Jebakan]] dulu.** Proyek ini sudah punya catatan jebakan —
mungkin masalah lintas platform sudah pernah dibahas di sana.

**Jangan langsung ubah kode.** Rencana ini belum disetujui.
Tunggu keputusan Afgan soal 3 pertanyaan di atas.
