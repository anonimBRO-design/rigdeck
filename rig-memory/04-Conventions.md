---
type: conventions
---
# Conventions & Memory Protocol

## Protokol memori (WAJIB untuk semua AI)
1. **Sebelum kerja**: baca [[00-INDEX]], [[01-Project-Context]], [[02-Decisions]], dan journal terbaru di `journal/`.
2. **Sesudah kerja**: tambahkan SATU baris ke `journal/YYYY-MM-DD.md`:
   `- HH:MM **[nama-agent]** `kind` — ringkasan singkat (file yang diubah, hasil, blocker)`
   - `kind`: `mission` · `progress` · `decision` · `handoff` · `review` · `blocker`
3. **Keputusan arsitektur** → juga tambahkan di [[02-Decisions]] (append-only, jangan hapus yang lama).
4. **Serah-terima** ke AI lain → buat file di `handoffs/` dan sebut di journal.
5. Jangan menyimpan secret/API key di vault ini.

## Kode
- Komunikasi dengan user: Bahasa Indonesia santai.
- Rust: `cargo check` & `cargo test` harus lulus. Frontend: `bun run build` harus lulus.
