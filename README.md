# RigDeck 🚀
> Next-Gen Autonomous Multi-Agent Mission Control & Orchestration Studio

RigDeck is a modern, lightweight desktop orchestration studio for multi-agent coding. It unifies headless CLI agents (Claude Code, Codex, Agy, local LLMs via 9Router) into a visual, cohesive team with isolated Git Worktrees, live PTY multiplexing, and Universal MCP Server capabilities.

## 📑 Documentation
- [Product Requirements Document (PRD)](./PRD.md)

## 🏗️ Architecture Overview
- **GUI Desktop**: Tauri v2 / Modern Web Shell (React 19 + TypeScript + Tailwind + shadcn/ui)
- **Terminal Multiplexing**: xterm.js + WebGL Addon
- **Process Supervisor & PTY**: Rust / Bun Daemon
- **Isolation Engine**: Git Worktrees (`.rig/worktrees/*`)
- **State & Memory**: SQLite (WAL mode)
- **LLM Gateway**: 9Router (`http://127.0.0.1:20128/v1`)
- **App Interoperability**: Universal MCP Server Hub (STDIO & SSE)
