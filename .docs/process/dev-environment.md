# Dev Environment Setup (WSL2)

Local development is done on **WSL2 (Ubuntu)**, not Docker and not native Windows Node. Docker is reserved for eventual deployment on the home server (see `.docs/ops/infrastructure.md`); native Windows Node is avoided because native-compile npm packages (e.g. `better-sqlite3`) build more reliably on Linux, and it keeps the dev environment closer to the eventual Arch server.

The Android app is the exception — it's developed natively on Windows via Android Studio, since Docker offers no benefit there and GPU-accelerated emulation in a container is impractical.

## 1. Install WSL2 + Ubuntu

In Windows PowerShell (as Administrator):

```powershell
wsl --install -d Ubuntu
```

Verify WSL2 (not WSL1):

```powershell
wsl -l -v
```

If it shows version 1:

```powershell
wsl --set-version Ubuntu 2
```

## 2. Node via nvm

Don't use Ubuntu's apt Node package (stale). Use nvm:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install --lts
node -v
npm -v
```

## 3. Native build tools

Required for `better-sqlite3` and similar native-compile packages:

```bash
sudo apt update
sudo apt install -y build-essential python3
```

## 4. Repo location

Keep the repo inside the **Linux filesystem** (e.g. `~/projects/brainlessmusic`), not under `/mnt/c/...` — cross-filesystem I/O is noticeably slower, especially for `npm install`.

```bash
mkdir -p ~/projects
cd ~/projects
git clone https://github.com/meranisu/brainlessmusic.git
cd brainlessmusic
git config user.name "Your Name"
git config user.email "your_email@example.com"
```

## 5. Editor

Install the **WSL extension for VS Code**, then launch from inside the WSL shell:

```bash
cd ~/projects/brainlessmusic
code .
```

This opens VS Code on Windows with the editor backend running inside WSL2 — correct Node version, full IntelliSense, integrated terminal.

## 6. Running the backend

```bash
cd ~/projects/brainlessmusic/backend
npm install
npm run dev
```

WSL2's default network mirroring means `localhost:<port>` is reachable from Windows-side tools (browser, Postman) without extra config.

## 7. Android emulator ↔ WSL2 backend networking

- The Android **emulator** does not see `localhost` as the host machine — it has its own loopback. Use `10.0.2.2` instead, the emulator's alias for the host's `localhost`.
- Dev server config screen: enter `http://10.0.2.2:<port>` (not `localhost`) when testing against the backend from the emulator.
- For a **physical device** instead of the emulator: requires the WSL2 machine's LAN-reachable IP, which is more involved since WSL2 is NATed behind Windows by default. Not needed until physical-device testing is required.

## Git auth

- **HTTPS:** GitHub requires a Personal Access Token (PAT) instead of a password. Generate one under Settings → Developer settings → Personal access tokens, `repo` scope. Cache it with `git config --global credential.helper store`.
- **SSH (preferred long-term):** generate a WSL2-specific key (`ssh-keygen -t ed25519`), add the public key under GitHub → Settings → SSH and GPG keys, then clone/use the `git@github.com:...` URL form.
