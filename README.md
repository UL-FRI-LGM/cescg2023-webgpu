# WebGPU Examples
A collection of WebGPU examples for the CESCG 2023 conference workshop.

## You will need

Three things:
1. Internet browser with WebGPU support
2. Local server
3. (this) Workshop Git repository

### Internet browser with WebGPU support

* On Windows, MacOs:
  * Download [Google Chrome](https://www.google.com/chrome)
    * Check if Chrome version is already 113 (early roll-out)
  * Alternatively: Download [Google Chrome Canary](https://www.google.com/chrome/canary/)
    * Enable WebGPU via `chrome://flags` (`#enable-unsafe-webgpu`)
    * Restart browser
* On Linux:
  * Download Chromium
    * Option 1: [https://download-chromium.appspot.com/](https://download-chromium.appspot.com/)
    * Option 2: [https://github.com/scheib/chromium-latest-linux](https://github.com/scheib/chromium-latest-linux) then update.sh
  * On Ubuntu 22.04: Don’t use snap / apt version
  * Enable WebGPU (`#enable-unsafe-webgpu`) and Vulkan (`#enable-vulkan`) backend via `chrome://flags` then restart browser
  * To see if it works, check `chrome://gpu` and/or [https://toji.github.io/webgpu-test/](https://toji.github.io/webgpu-test/)
  * If does not work, use the built-in software renderer SwiftShader via the commandline flag `--use-webgpu-adapter=swiftshader`

### Local server

* Our recommendation: [Visual Studio Code](https://code.visualstudio.com/)
  * Go to Extensions > Search "Live Server" (over 33 million downloads) > Install
  * Alternatively: Install from [here](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer)
* Alternatively: Have Python installed; we provide a [Python server](./bin/server.py) `python3 server.py`
* Alternatively: Have Node.js installed; we provide a [Node.js server](./bin/server.js) `node server.js`
* Alternatively: Have WebStorm installed; [open the HTML file in a browser](https://www.jetbrains.com/help/webstorm/editing-html-files.html#ws_html_preview_output_procedure)

### (this) Workshop Git repository

`git clone https://github.com/UL-FRI-LGM/cescg2023-webgpu`

## Tasks & Reference Implementations

During the four parts of this workshop you're going to solve tasks in order to learn how to use the WebGPU API.
For each part, you'll find the task descriptions as well as the respective reference implementation in its respective folder:
* [Part 1](Part%201/Task%20Description.md)
* [Part 2](Part%202/Task%20Description.md)
* [Part 3](Part%203/Task%20Description.md)
* [Part 4](Part%204/Task%20Description.md)

You can also check out the reference implementations in the browser.
Start a server in the project's root directory and navigate to [reference implementations.html](reference-implementations.html).
