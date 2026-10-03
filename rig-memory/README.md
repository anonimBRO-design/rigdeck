# Memori Bersama Agent — RigDeck

Papan kerja bersama untuk 4 AI yang mengerjakan proyek **RigDeck (OpenRig-GUI)**:
1. 🟣 **Master AI Conductor** (9Router)
2. 🟠 **Claude Desktop** (The Architect)
3. 🔵 **Antigravity IDE** (The Coder & OS Engine)
4. ⚪ **ChatGPT Desktop** (The Reviewer)

---

## Kenapa Ada Ini?

Agent AI tidak punya memori bawaan lintas aplikasi. Tiap aplikasi berdiri sendiri di jendela terpisah.
Folder ini menjadi jembatan bersama dalam format markdown murni, bisa dibaca dan ditulis oleh agen mana pun tanpa plugin rumit, dan bisa dibuka langsung di **Obsidian**.

---

## Protokol Kerja

### Sebelum Mulai Kerja
1. Baca **[[Handoff]]** — state terkini, sedang apa, langkah berikutnya.
2. Baca **[[Jebakan]]** — hal yang sudah pernah bikin rugi di Linux/Rust/Tauri. **Jangan ulangi.**
3. Baca catatan keputusan di **[[02-Decisions]]** dan indeks di **[[00-INDEX]]**.

### Setelah Selesai Kerja
1. Tulis ringkasan di `journal/YYYY-MM-DD.md` atau `Log/`.
2. Perbarui **[[Handoff]]** bila ada perubahan state atau tugas baru.
3. Tambahkan ke **[[Jebakan]]** jika menemukan celah/bug baru.

---

## Navigasi Vault

- [[Handoff]] — state terkini proyek
- [[Jebakan]] — daftar kesalahan/perangkap arsitektur yang harus dihindari
- [[00-INDEX]] — daftar catatan arsitektur & peran agen
- [[01-Project-Context]] — ringkasan teknis proyek
- [[02-Decisions]] — keputusan arsitektur (append-only)
- `journal/` — log kerja harian bersama
