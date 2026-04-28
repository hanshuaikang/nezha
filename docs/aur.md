# AUR Packaging

This repository includes AUR packaging for the stable source package `nezha-ide` under `packaging/aur/`.

## Package Naming

The packaging uses `nezha-ide` as the AUR package name.

At the time this change was prepared, AUR searches for `nezha`, `nezha-ide`, `nezha-git`, and `nezha-bin` returned no matches. If the upstream maintainers prefer a different final package name, update `pkgbase`, `pkgname`, workflow `PKGBASE`, and the published AUR repository URL together.

## GitHub Secrets

The publish workflow expects these repository secrets:

- `AUR_SSH_PRIVATE_KEY`: SSH private key for the AUR maintainer account.
- `AUR_KNOWN_HOSTS`: Output of `ssh-keyscan aur.archlinux.org`.

Do not commit private keys, tokens, or AUR credentials into the repository.

## Workflow Behavior

`.github/workflows/publish-aur.yml`:

- always supports `workflow_dispatch`
- publishes on GitHub `release.published`
- also publishes on `v*` tag pushes
- updates `packaging/aur/PKGBUILD` with the release version and source tarball checksum
- regenerates `packaging/aur/.SRCINFO` with `makepkg --printsrcinfo`
- pushes only when `PKGBUILD` or `.SRCINFO` actually changed

The workflow is intentionally separate from `.github/workflows/checks.yml` so routine CI remains unchanged.

## Local Verification

Project checks:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm build
```

Arch packaging checks inside a container:

```bash
podman run --rm -it -v "$PWD:/src" -w /src archlinux:latest bash
pacman -Syu --noconfirm --needed base-devel git pnpm nodejs rust cargo pkgconf gtk3 webkit2gtk-4.1 libayatana-appindicator librsvg openssl
useradd --create-home --shell /bin/bash builder
chown -R builder:builder /src
cd packaging/aur
su builder -c 'cd /src/packaging/aur && makepkg --printsrcinfo > .SRCINFO && makepkg -si --noconfirm'
```

If your environment uses Docker instead of Podman, the same steps work with `docker run`.

## Notes

- The package builds from the GitHub source tarball for `v${pkgver}`.
- `pnpm tauri build --no-bundle` is used so the package installs the real `nezha` binary rather than relying on an AppImage.
- The desktop entry and icons are installed into standard system paths during packaging.
