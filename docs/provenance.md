# Source provenance

This repository contains the converter implementation and synthetic tests. It does not distribute the plugins or the editor.

The implementation uses JSON field names, numeric type values, asset path identifiers, and binary format details for compatibility. These identifiers are not plugin implementations. The protobuf reader, LZ4 block reader, transform calculations, matching logic, and interface were written for this project.

The compressed test fixture contains two synthetic box records. It contains no vehicle configuration or game asset data.

Local plugin sources, decompiled research, vehicle configurations, inspection reports, screenshots, and tests with real vehicle data remain outside the published tree. Git excludes the `private/` and `.local/` folders. The development server also denies access to `private/`. The Pages workflow uploads only the generated `dist/` folder.

The optional `scripts/verify-rustedit.ps1` tool reads libraries from an existing RustEdit installation. It does not include those libraries. Its small schema describes the file format, not editor behavior.

## References

- [Facepunch map data schema](https://wiki.facepunch.com/rust/Map_Data)
- [LZ4 block format](https://github.com/lz4/lz4/blob/dev/doc/lz4_Block_format.md)
- [Protocol Buffers encoding](https://protobuf.dev/programming-guides/encoding/)
- [CopyPaste](https://umod.org/plugins/copy-paste)
- [RustEdit](https://www.rustedit.io/)
- [RustCar](https://karuza.dev/store/product/566c04c2-c4a7-4ba3-983c-3fdb362424f9)

## Third-party software

Dependencies are installed from npm. Their license texts are collected in `THIRD_PARTY_NOTICES.txt`. The build copies these notices into the static site and embeds them in the offline HTML file. Third-party licenses remain separate from the converter's MIT license.
