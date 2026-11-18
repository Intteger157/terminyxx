# Vendored IronRDP web client

The built-in RDP client (`components/rdp/RdpPane.tsx`) uses these two packages instead of the npm releases:

- `iron-remote-desktop`: the `<iron-remote-desktop>` web component.
- `iron-remote-desktop-rdp`: the RDP backend, IronRDP compiled to WebAssembly (the `.wasm` is inlined as a `data:` URL).

They are built from our fork [Intteger157/IronRDP](https://github.com/Intteger157/IronRDP), branch `terminyxx`, commit
`78024a8fe595cd221660870f04c59bced50b785d`: upstream [IronRDP](https://github.com/Devolutions/IronRDP) `abfc97b`
(2026-11-16, sspi 0.23.1) plus changes meant to go upstream:

- `printers([...])` announces several printers (every local printer, each with its own driver), `onJobStart` gets the
  printer's device ID, and `onPrinterAnnounced` reports the host's answer to each announcement.
- `drives([...])` redirects folders. The browser can't open files, so each filesystem request of the host goes to
  `driveRequestCallback` and is completed when the page answers with `invokeExtension(driveReply({...}))`; directory
  listings are fetched once per query and enumerated in WASM. Printers and drives share one RDPDR backend.
- `scale="fit"` (and `real`/`full`) sizes the picture to the element's own box instead of the space between the element
  and the window's bottom-right corner, refits when the element resizes (`ResizeObserver`), and `resize()` no longer sets
  the viewer to the requested size in desktop pixels (twice the CSS size on a Retina screen) before the server answers.
- `scale="stretch"` fills the element exactly without keeping the aspect ratio (like mstsc's smart sizing).

The npm releases (`@devolutions/iron-remote-desktop-rdp` 0.7.0, May 2026) embed sspi 0.21.0. With that version, Windows 11
refused NLA sign-in from Terminyxx with ERROR_LOGON_FAILURE even though Windows App accepted the same credentials, and Windows
logged no credential check at all. Several NTLM/CredSSP fixes landed in sspi between 0.21.0 and 0.23.1.

To rebuild (for example after rebasing the fork on a newer IronRDP), run `./build.sh [commit]` (`IRONRDP_REPO=<url>` builds
from another repository), update the commit above, and run `npm install` in `frontend/`. The two packages must come from the same commit: the component calls backend methods by name.

License: MIT or Apache-2.0 (`LICENSE-MIT`, `LICENSE-APACHE`).
