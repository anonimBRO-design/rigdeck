#!/usr/bin/env node
/**
 * Prototipe adapter CLI agent untuk RigDeck.
 *
 * MASALAH: `claude` dan `agy` punya format stream-json BERBEDA.
 *   claude : {"type":"assistant","message":{"content":[{"type":"text",...}]}}
 *   agy    : {"event":"step_update","step_update":{"state":"DONE",...}}
 *
 * SOLUSI: lapisan penerjemah. Keduanya diubah jadi SATU format seragam,
 * supaya RigDeck cuma perlu paham satu format.
 *
 * Format seragam:
 *   { agent, jenis, isi }
 *   jenis: 'mulai' | 'teks' | 'alat' | 'selesai' | 'galat'
 *
 * Cara pakai:
 *   node adapter.js claude "bilang halo"
 *   node adapter.js agy    "bilang halo"
 */

'use strict';

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* ------------------------------------------------------------------ *
 * Ambil env 9Router dari settings.json Claude Code
 *
 * JANGAN hardcode token di kode. Token bisa berubah, dan kalau
 * di-hardcode lalu di-commit, itu kebocoran.
 * ------------------------------------------------------------------ */
function envDariSettings() {
  const p = path.join(os.homedir(), '.claude', 'settings.json');
  try {
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    return d.env || {};
  } catch (e) {
    return {};
  }
}

/* ------------------------------------------------------------------ *
 * Penerjemah: claude
 * ------------------------------------------------------------------ */
function terjemahClaude(obj) {
  // {"type":"system","subtype":"init",...}
  if (obj.type === 'system' && obj.subtype === 'init') {
    return { jenis: 'mulai', isi: { sesi: obj.session_id, model: obj.model } };
  }

  // {"type":"assistant","message":{"content":[{"type":"text","text":"..."}]}}
  if (obj.type === 'assistant' && obj.message) {
    const bagian = obj.message.content || [];
    const teks = bagian.filter(b => b.type === 'text').map(b => b.text).join('');
    const alat = bagian.filter(b => b.type === 'tool_use');
    if (alat.length) {
      return {
        jenis: 'alat',
        isi: { nama: alat[0].name, masukan: alat[0].input },
      };
    }
    if (teks) return { jenis: 'teks', isi: { teks } };
    return null;
  }

  // {"type":"result",...}  -> akhir
  if (obj.type === 'result') {
    return {
      jenis: 'selesai',
      isi: { biaya: obj.total_cost_usd, durasi: obj.duration_ms },
    };
  }

  return null;   // tipe lain: abaikan
}

/* ------------------------------------------------------------------ *
 * Penerjemah: agy
 * ------------------------------------------------------------------ */
function terjemahAgy(obj) {
  // {"event":"init","conversation_id":"...","init":{...}}
  if (obj.event === 'init') {
    return { jenis: 'mulai', isi: { sesi: obj.conversation_id } };
  }

  // {"event":"result","result":{"status":"SUCCESS","response":"...",...}}
  //
  // PENTING: jawaban agy ada di SINI, bukan di step_update.
  // Awalnya saya kira step_update berisi teks — ternyata cuma status
  // langkah ("tool", "agent_response"), tanpa isi jawaban.
  if (obj.event === 'result' && obj.result) {
    const r = obj.result;
    if (r.status && r.status !== 'SUCCESS') {
      return { jenis: 'galat', isi: { pesan: r.error || r.status } };
    }
    return {
      jenis: 'teks',
      isi: {
        teks: String(r.response || '').trim(),
        durasi: r.duration_seconds,
        token: r.usage && r.usage.input_tokens,
      },
    };
  }

  // {"event":"step_update",...}  -> kemajuan, bukan teks.
  // Diteruskan sebagai 'langkah' supaya Terminal Grid bisa tampilkan
  // indikator "sedang bekerja", tapi tidak dianggap jawaban.
  if (obj.event === 'step_update' && obj.step_update) {
    const s = obj.step_update;
    if (s.state === 'DONE' && s.step_type && s.step_type !== 'user_input') {
      return { jenis: 'langkah', isi: { nama: s.step_type } };
    }
    return null;
  }

  // {"event":"error", ...}
  if (obj.event === 'error' || obj.error) {
    return { jenis: 'galat', isi: { pesan: obj.error || obj.message } };
  }

  return null;
}

/* ------------------------------------------------------------------ *
 * Cari path executable
 *
 * Di Windows, `claude` itu file `claude.cmd` — tidak bisa di-spawn
 * langsung tanpa shell. Jadi kita cari path lengkapnya sendiri.
 * Ini menghindari shell:true (yang memicu warning + risiko injeksi).
 * ------------------------------------------------------------------ */
function cariExecutable(nama, envPath) {
  // Urutan penting: .exe DULU.
  // File .cmd/.bat tidak bisa di-spawn langsung di Windows (EINVAL),
  // dan memaksa shell:true berisiko injeksi perintah.
  // Paket npm modern biasanya menyediakan binary .exe aslinya.
  const ext = process.platform === 'win32'
    ? ['.exe', '.cmd', '.bat', '']
    : [''];

  const dirs = (envPath || '').split(path.delimiter).filter(Boolean);

  // Kasus khusus claude: binary aslinya ada di dalam node_modules,
  // bukan di folder npm biasa.
  if (process.platform === 'win32' && nama === 'claude') {
    const kandidat = dirs
      .map(d => path.join(d, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'))
      .find(p => { try { return fs.existsSync(p); } catch (_) { return false; } });
    if (kandidat) return kandidat;
  }

  for (const d of dirs) {
    for (const e of ext) {
      const p = path.join(d, nama + e);
      try {
        if (fs.existsSync(p)) return p;
      } catch (_) { /* lanjut */ }
    }
  }
  return nama;   // fallback
}

/* ------------------------------------------------------------------ *
 * Jalankan agent
 * ------------------------------------------------------------------ */
function jalankan(agent, prompt, opsi = {}) {
  const cwd = opsi.cwd || process.cwd();

  let cmd, args, env = { ...process.env };

  if (agent === 'claude') {
    // claude butuh env 9Router, kalau tidak -> "Not logged in"
    Object.assign(env, envDariSettings());
    cmd = 'claude';
    args = ['-p', prompt, '--output-format', 'stream-json', '--verbose'];
  } else if (agent === 'agy') {
    cmd = 'agy';
    args = ['-p', prompt, '--output-format', 'stream-json'];
    // agy ada di PATH user
    const dir = path.join(os.homedir(), 'AppData', 'Local', 'agy', 'bin');
    if (fs.existsSync(dir)) env.PATH = dir + path.delimiter + env.PATH;
  } else {
    throw new Error('agent tidak dikenal: ' + agent);
  }

  // JANGAN pakai shell:true — memicu DeprecationWarning dan
  // berisiko injeksi perintah. Resolve path-nya sendiri.
  const exePath = cariExecutable(cmd, env.PATH);

  const anak = spawn(exePath, args, {
    cwd,
    env,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],   // tutup stdin: hindari warning "no stdin"
  });

  let sisa = '';   // buffer baris yang belum lengkap

  const prosesBaris = (baris) => {
    const t = baris.trim();
    if (!t) return;
    let obj;
    try {
      obj = JSON.parse(t);
    } catch (e) {
      return;   // bukan JSON, abaikan
    }
    const hasil = agent === 'claude' ? terjemahClaude(obj) : terjemahAgy(obj);
    if (hasil) {
      console.log(JSON.stringify({ agent, ...hasil }));
    }
  };

  // stream-json = satu JSON per baris (NDJSON)
  anak.stdout.on('data', (buf) => {
    sisa += buf.toString();
    const baris = sisa.split('\n');
    sisa = baris.pop();          // simpan sisa yang belum lengkap
    baris.forEach(prosesBaris);
  });

  anak.stderr.on('data', (buf) => {
    const pesan = buf.toString().trim();
    if (!pesan) return;
    // Sebagian pesan stderr bukan error sebenarnya (warning, deprecation).
    // Jangan lapor sebagai galat — bikin bingung di Terminal Grid.
    const bukanGalat = /^(Warning:|\s*\(node:|DeprecationWarning|\s*Use `node)/i.test(pesan);
    if (!bukanGalat) {
      console.log(JSON.stringify({ agent, jenis: 'galat', isi: { pesan } }));
    }
  });

  anak.on('close', (kode) => {
    if (sisa.trim()) prosesBaris(sisa);
    console.log(JSON.stringify({ agent, jenis: 'tutup', isi: { kode } }));
  });

  return anak;
}

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */
const dijalankanLangsung = process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (dijalankanLangsung) {
  const [agent, ...sisaArg] = process.argv.slice(2);
  const prompt = sisaArg.join(' ');

  if (!agent || !prompt) {
    console.error('Pakai: node adapter.js <claude|agy> "<prompt>"');
    process.exit(1);
  }

  jalankan(agent, prompt);
}

export { jalankan, terjemahClaude, terjemahAgy, envDariSettings };
