# RustEdit / RustCar Converter

Edit [RustCar](https://karuza.dev/store/product/566c04c2-c4a7-4ba3-983c-3fdb362424f9) vehicle geometry in [RustEdit](https://www.rustedit.io/), then import the changes into the original car configuration.

**[Open the converter](https://niposch.github.io/rustedit-rustcars-converter/)**

## Features

- Convert RustCar JSON to RustEdit `.prefab` or [CopyPaste](https://umod.org/plugins/copy-paste) JSON.
- Import edited geometry without replacing the car settings.
- Load a file or paste JSON from the clipboard.
- Rotate, pan, and zoom the 3D prop layout.
- Process files in the browser. No server receives your car data.

## Use

1. Load the original car JSON. Download the `.prefab` file to preserve scale.
2. Edit the parts in RustEdit. Keep the origin marker with the car.
3. Save the selection as a custom `.prefab` file.
4. Select **Back to RustCar**. Load the edited file and download the updated JSON.

Keep the original JSON. Some runtime parts cannot appear correctly in RustEdit. Missing parts stay in the original configuration by default.

## Run locally

Requires Node.js 22 or later.

```sh
npm ci
npm run dev
```

Run `npm test` to check the converter. Run `npm run build` to create the static site and the offline file `dist/workshop.html`.

## License

The converter uses the [MIT license](LICENSE). It includes no RustCar plugin source, RustEdit binaries, game assets, or vehicle configurations.

Dependencies retain their own licenses. See [third-party notices](THIRD_PARTY_NOTICES.txt) and [source provenance](docs/provenance.md).
