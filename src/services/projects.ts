import { invoke } from "@tauri-apps/api/core";
import { ProjectItem } from "../types";

/** Daftar project yang pernah dibuka (registry ~/.config/rigdeck/projects.json). */
export async function listProjects(): Promise<ProjectItem[]> {
  try {
    return await invoke<ProjectItem[]>("list_projects");
  } catch (err) {
    console.warn("Gagal memuat daftar project:", err);
    return [];
  }
}

export async function getCurrentProject(): Promise<ProjectItem | null> {
  try {
    return await invoke<ProjectItem>("get_current_project");
  } catch {
    return null;
  }
}

/**
 * Pindah project aktif: backend akan menyiapkan rig-memory/ di root baru
 * dan membuka .rig/blackboard.db milik project tersebut.
 */
export async function switchProject(projectId: string): Promise<ProjectItem> {
  return await invoke<ProjectItem>("switch_project", { projectId });
}

export async function addOrOpenProject(path: string, name?: string): Promise<ProjectItem> {
  return await invoke<ProjectItem>("add_or_open_project", { path, name: name ?? null });
}

/** Buka dialog GTK (zenity) untuk memilih folder project. Null bila user membatalkan. */
export async function pickProjectFolder(): Promise<string | null> {
  try {
    return await invoke<string | null>("pick_project_folder");
  } catch {
    return null;
  }
}

/** Nama folder paling akhir dari sebuah path absolut. */
export function projectBasename(path: string): string {
  const parts = path.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || path;
}

/** Path ringkas: `~/Projects/rigdeck` atau `…/parent/child`. */
export function shortenPath(path: string, maxSegments = 2): string {
  const home = "/home/anonimbro";
  let p = path.startsWith(home) ? `~${path.slice(home.length)}` : path;
  const segments = p.split("/").filter(Boolean);
  if (segments.length > maxSegments) {
    p = "…/" + segments.slice(-maxSegments).join("/");
  }
  return p;
}
