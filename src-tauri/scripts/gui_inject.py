#!/usr/bin/env python3
import sys
import os
import time
import subprocess
import ctypes

def set_clipboard(text: str):
    """Sets system clipboard across Linux (GTK/Gdk) and Windows (ctypes/Win32)."""
    if sys.platform == "win32":
        try:
            # Win32 standard clipboard API
            user32 = ctypes.windll.user32
            kernel32 = ctypes.windll.kernel32

            # WAJIB deklarasikan argtypes/restype. Default ctypes = c_int (32-bit),
            # sedangkan di Windows 64-bit handle & pointer berukuran 64-bit.
            # Tanpa ini, hasil GlobalAlloc/GlobalLock terpotong -> pointer invalid
            # -> memmove menulis ke 0x0 -> "access violation writing 0x0".
            kernel32.GlobalAlloc.restype = ctypes.c_void_p
            kernel32.GlobalAlloc.argtypes = [ctypes.c_uint, ctypes.c_size_t]
            kernel32.GlobalLock.restype = ctypes.c_void_p
            kernel32.GlobalLock.argtypes = [ctypes.c_void_p]
            kernel32.GlobalUnlock.argtypes = [ctypes.c_void_p]
            user32.OpenClipboard.argtypes = [ctypes.c_void_p]
            user32.OpenClipboard.restype = ctypes.c_int
            user32.EmptyClipboard.restype = ctypes.c_int
            user32.SetClipboardData.restype = ctypes.c_void_p
            user32.SetClipboardData.argtypes = [ctypes.c_uint, ctypes.c_void_p]
            user32.CloseClipboard.restype = ctypes.c_int

            if not user32.OpenClipboard(None):
                return False
            user32.EmptyClipboard()

            # CF_UNICODETEXT = 13
            text_bytes = text.encode("utf-16le") + b"\x00\x00"
            GMEM_MOVEABLE = 0x0002
            h_mem = kernel32.GlobalAlloc(GMEM_MOVEABLE, len(text_bytes))
            if not h_mem:
                user32.CloseClipboard()
                return False
            p_mem = kernel32.GlobalLock(h_mem)
            if not p_mem:
                kernel32.GlobalFree(h_mem)
                user32.CloseClipboard()
                return False
            ctypes.memmove(p_mem, text_bytes, len(text_bytes))
            kernel32.GlobalUnlock(h_mem)

            user32.SetClipboardData(13, h_mem)
            user32.CloseClipboard()
            return True
        except Exception as e:
            print(f"[gui_inject] Windows clipboard warning: {e}", file=sys.stderr)
            return False
    else:
        # Linux GTK/Gdk
        try:
            import gi
            gi.require_version('Gtk', '3.0')
            from gi.repository import Gtk, Gdk

            clip = Gtk.Clipboard.get(Gdk.SELECTION_CLIPBOARD)
            clip.set_text(text, -1)
            clip.store()

            primary = Gtk.Clipboard.get(Gdk.SELECTION_PRIMARY)
            primary.set_text(text, -1)
            primary.store()

            for _ in range(10):
                while Gtk.events_pending():
                    Gtk.main_iteration()
                time.sleep(0.01)
            return True
        except Exception as e:
            print(f"[gui_inject] GTK clipboard warning: {e}", file=sys.stderr)
            return False

def _linux_focus_by_pid(proc_hint: str) -> bool:
    """Cari jendela lewat _NET_WM_PID, lalu fokuskan pakai wmctrl.

    Padanan perbaikan Windows: alih-alih percaya judul/WM_CLASS, cari proses
    aplikasi -> ambil PID-nya -> cocokkan dengan _NET_WM_PID tiap jendela.
    Membutuhkan `pgrep` (procps) dan `xprop` (x11-utils). Kalau salah satu
    tak tersedia, kembalikan False supaya pemanggil bisa menangani.
    """
    try:
        found = subprocess.run(
            ["pgrep", "-f", proc_hint], capture_output=True, timeout=2
        )
        if found.returncode != 0:
            return False
        pids = set(found.stdout.decode(errors="replace").split())
        if not pids:
            return False

        listed = subprocess.run(
            ["wmctrl", "-lp"], capture_output=True, timeout=2
        )
        if listed.returncode != 0:
            return False

        for line in listed.stdout.decode(errors="replace").splitlines():
            parts = line.split(None, 4)
            if len(parts) < 3:
                continue
            win_id, pid = parts[0], parts[2]
            if pid not in pids:
                continue

            # Verifikasi via _NET_WM_PID (jika xprop tersedia) supaya PID dari
            # pgrep -f tidak salah cocok ke jendela lain.
            if _window_pid(win_id) not in (None, pid):
                continue

            res = subprocess.run(
                ["wmctrl", "-i", "-a", win_id], capture_output=True, timeout=2
            )
            if res.returncode == 0:
                return True
    except Exception:
        pass
    return False


def _window_pid(win_id: str):
    """Ambil _NET_WM_PID sebuah jendela lewat xprop; None kalau tak tersedia."""
    try:
        res = subprocess.run(
            ["xprop", "-id", win_id, "_NET_WM_PID"], capture_output=True, timeout=2
        )
        if res.returncode != 0:
            return None
        out = res.stdout.decode(errors="replace")
        if "_NET_WM_PID" not in out or "=" not in out:
            return None
        return out.split("=", 1)[1].strip()
    except Exception:
        return None


def focus_window(app_name: str) -> bool:
    """Focuses the target window using wmctrl on Linux or PowerShell on Windows.

    Windows: cari lewat NAMA PROSES (bukan judul jendela), lalu AppActivate
    pakai PID. Judul jendela Antigravity berubah sesuai dokumen yang dibuka
    (mis. "Data Analysis Request - A..."), jadi AppActivate("Antigravity")
    gagal walau aplikasinya terbuka. Claude kebetulan jalan karena judulnya
    memang "Claude".
    """
    app_lower = app_name.lower()

    if sys.platform == "win32":
        if "claude" in app_lower:
            proc_name = "claude"
        elif "chatgpt" in app_lower:
            proc_name = "ChatGPT"
        elif "antigravity" in app_lower:
            proc_name = "Antigravity"
        elif "codex" in app_lower:
            proc_name = "Codex"
        elif "hermes" in app_lower:
            proc_name = "Hermes"
        else:
            proc_name = app_name

        ps_cmd = (
            "$ErrorActionPreference = 'SilentlyContinue'; "
            f"$p = Get-Process -Name '{proc_name}' | "
            "Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1; "
            "if ($p) { "
            "$ok = (New-Object -ComObject WScript.Shell).AppActivate($p.Id); "
            "if ($ok) { Write-Output 'OK' } else { Write-Output 'GAGAL' } "
            "} else { Write-Output 'NOTFOUND' }"
        )
        try:
            res = subprocess.run(
                ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_cmd],
                capture_output=True,
                timeout=5,
            )
            out = res.stdout.decode(errors="replace").strip()
            return out == "OK"
        except Exception:
            return False
    else:
        # 1) Jalur cepat: WM_CLASS / judul lewat wmctrl.
        targets = []
        if "claude" in app_lower:
            targets = [("-x", "com.anthropic.Claude"), ("", "Claude")]
        elif "chatgpt" in app_lower:
            targets = [("-x", "chatgpt"), ("", "ChatGPT")]
        elif "antigravity" in app_lower:
            targets = [("-x", "Antigravity"), ("", "Antigravity")]
        elif "hermes" in app_lower:
            targets = [("-x", "hermes"), ("", "Hermes")]
        else:
            targets = [("", app_name)]

        for flag, target in targets:
            args = ["wmctrl"]
            if flag:
                args.append(flag)
            args.extend(["-a", target])
            try:
                res = subprocess.run(args, capture_output=True, timeout=2)
                if res.returncode == 0:
                    return True
            except Exception:
                pass

        # 2) Fallback: cocokkan lewat _NET_WM_PID (padanan perbaikan Windows).
        #    WM_CLASS/judul Antigravity bisa berubah atau tak terduga, jadi cari
        #    proses -> PID -> jendela yang _NET_WM_PID-nya cocok. Perlu xprop
        #    (paket x11-utils) dan pgrep; kalau tak ada, lewati dengan aman.
        if "claude" in app_lower:
            proc_hint = "claude"
        elif "chatgpt" in app_lower:
            proc_hint = "chatgpt"
        elif "antigravity" in app_lower:
            proc_hint = "antigravity"
        elif "codex" in app_lower:
            proc_hint = "codex"
        else:
            proc_hint = app_name

        if _linux_focus_by_pid(proc_hint):
            return True

        return False

def inject_paste_and_submit(auto_submit: bool = False):
    """Simulates Ctrl+A, Ctrl+V, and Enter via X11 libXtst on Linux or keybd_event on Windows."""
    if sys.platform == "win32":
        try:
            user32 = ctypes.windll.user32
            VK_CONTROL = 0x11
            VK_A = 0x41
            VK_V = 0x56
            VK_RETURN = 0x0D
            KEYEVENTF_KEYUP = 0x0002

            def key_down(code):
                user32.keybd_event(code, 0, 0, 0)
                time.sleep(0.02)

            def key_up(code):
                user32.keybd_event(code, 0, KEYEVENTF_KEYUP, 0)
                time.sleep(0.02)

            def tap(code):
                key_down(code)
                key_up(code)

            def chord(mod, key):
                key_down(mod)
                tap(key)
                key_up(mod)

            # Ctrl+A
            chord(VK_CONTROL, VK_A)
            time.sleep(0.05)

            # Ctrl+V
            chord(VK_CONTROL, VK_V)
            time.sleep(0.1)

            # Enter
            if auto_submit:
                time.sleep(0.15)
                tap(VK_RETURN)

            return True
        except Exception as e:
            print(f"[gui_inject] Windows keybd_event error: {e}", file=sys.stderr)
            return False
    else:
        # Linux X11 libXtst
        try:
            x11 = ctypes.CDLL('libX11.so.6')
            xtst = ctypes.CDLL('libXtst.so.6')

            x11.XOpenDisplay.restype = ctypes.c_void_p
            x11.XOpenDisplay.argtypes = [ctypes.c_char_p]
            x11.XCloseDisplay.restype = ctypes.c_int
            x11.XCloseDisplay.argtypes = [ctypes.c_void_p]
            x11.XFlush.restype = ctypes.c_int
            x11.XFlush.argtypes = [ctypes.c_void_p]

            xtst.XTestFakeKeyEvent.restype = ctypes.c_int
            xtst.XTestFakeKeyEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]

            display = x11.XOpenDisplay(None)
            if not display:
                print("[gui_inject] Could not open X display for keystroke injection", file=sys.stderr)
                return False

            # Keycodes from X11:
            VK_CTRL = 37
            VK_A = 38
            VK_V = 55
            VK_RETURN = 36

            def press_key(code):
                xtst.XTestFakeKeyEvent(display, code, 1, 0)
                x11.XFlush(display)
                time.sleep(0.03)

            def release_key(code):
                xtst.XTestFakeKeyEvent(display, code, 0, 0)
                x11.XFlush(display)
                time.sleep(0.03)

            def tap_key(code):
                press_key(code)
                release_key(code)

            def chord(mod, key):
                press_key(mod)
                tap_key(key)
                release_key(mod)

            # 1. Select all (Ctrl+A)
            chord(VK_CTRL, VK_A)
            time.sleep(0.05)

            # 2. Paste (Ctrl+V)
            chord(VK_CTRL, VK_V)
            time.sleep(0.1)

            # 3. Submit (Return) if requested
            if auto_submit:
                time.sleep(0.15)
                tap_key(VK_RETURN)

            x11.XCloseDisplay(display)
            return True
        except Exception as e:
            print(f"[gui_inject] XTest injection error: {e}", file=sys.stderr)
            return False

def main():
    if len(sys.argv) < 3:
        print("Usage: gui_inject.py <app_name> <text_or_file> [--submit]", file=sys.stderr)
        sys.exit(1)

    app_name = sys.argv[1]
    text_input = sys.argv[2]
    auto_submit = "--submit" in sys.argv

    if os.path.isfile(text_input):
        with open(text_input, "r", encoding="utf-8") as f:
            text = f.read()
    else:
        text = text_input

    # 1. Set OS clipboard
    set_clipboard(text)

    # 2. Focus target window — WAJIB berhasil sebelum kirim keystroke.
    #    Kalau gagal, Ctrl+A/Ctrl+V/Enter bisa masuk ke jendela yang salah
    #    dan menimpa konten yang tidak seharusnya.
    if not focus_window(app_name):
        print(f"[gui_inject] Gagal fokuskan jendela '{app_name}'", file=sys.stderr)
        sys.exit(2)

    # 3. Allow window focus and animation to settle
    time.sleep(0.35)

    # 4. Inject keystrokes
    inject_paste_and_submit(auto_submit=auto_submit)

    print("SUCCESS")

if __name__ == "__main__":
    main()
