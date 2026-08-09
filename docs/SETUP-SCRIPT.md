# Cloud environment setup script

This is the one piece of this repo's setup that **cannot be committed**. It has
to be pasted into a UI field by a human. No session, CC-CMD, or API can write
it.

## Paste this into the environment's Setup script field

At [claude.ai/code](https://claude.ai/code) → cloud environments → the
environment used for `field-laboratory` → **Setup script**:

```bash
#!/bin/bash
apt-get update && apt-get install -y --no-install-recommends dotnet-sdk-10.0 || true
```

That's the whole thing. Measured cold, from an environment with no .NET at all:
**~30 seconds**, well inside the field's ~5-minute budget.

## Why it belongs there and not in the repo

Claude Code's cloud-environments documentation draws the line explicitly:

> Use a setup script to provision the VM itself: toolchains and CLI tools that
> aren't pre-installed. Use a SessionStart hook for project setup that should
> run everywhere, cloud and local, like `npm install`.

The .NET SDK is a toolchain, and the docs name it directly: *"Toolchains outside
this list, such as the .NET SDK, aren't pre-installed even when their package
registries are on the default allowlist. Install them with a setup script."*

The practical reason is the environment cache. The setup script runs once, then
Anthropic snapshots the filesystem and reuses it. Pasting this in makes the
install **disappear from every subsequent session's startup**. Left to the
SessionStart hook fallback, it costs ~30 seconds on any session that lands on a
cold VM.

## Do not use the official installer

`dotnet-install.sh` is the documented route and it **does not work here**.
Measured:

| Host | Result |
| --- | --- |
| `dot.net` → redirects to the binary host | **403 CONNECT tunnel failed** |
| `builds.dotnet.microsoft.com` | **403 — gateway policy denial** |
| `dotnet.microsoft.com` | 200 — marketing site, no binaries |
| `archive.ubuntu.com` | 200 |
| `api.nuget.org` | 200 |

The default allowlist includes the bare `dotnet.microsoft.com` and `dot.net`
entries, but the host that actually serves the binaries is
`builds.dotnet.microsoft.com` — a different host, not covered, and denied. The
allowlist looks like it permits the official installer and doesn't.

Ubuntu's own archive carries the SDK, is reachable, and needs no third-party
repository.

## Why version 10, specifically

Not preference. Fable 5.x ships `tools/net10.0/` only — confirmed by unpacking
the real `.nupkg` for both 5.5.0 and 5.13.0, so this is a property of the whole
5.x line and not of one release. Under SDK 8 the tool install fails outright:

```
Microsoft.DotNet.ToolPackage.ToolConfigurationException:
Settings file 'DotnetToolSettings.xml' was not found in the package.
```

`dotnet-sdk-9.0` is not available in Ubuntu noble at all.

## The `apt-get update` is not optional

Without it, the install fails on a stale package index:

```
E: Failed to fetch http://security.ubuntu.com/.../dotnet-sdk-10.0_10.0.110-...deb  404  Not Found
```

That was the real first failure when this was worked out, not a hypothetical.

## What happens if you don't paste it

Nothing breaks. `scripts/install_dotnet.sh` runs from the SessionStart hook and
performs the same install as a fallback, and it is written to exit 0 even on
failure so it can never block a session. You just pay ~30 seconds on cold
sessions instead of zero, forever.
