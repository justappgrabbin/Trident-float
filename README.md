# Trident · local Qwen Coder

Trident is the Android assistant. Its complete **Qwen2.5-Coder-0.5B-Instruct Q4_K_M** weights and llama.cpp inference engine are inside its APK. Chat does not depend on Ollama, a computer server, GitHub, OpenAI, or a subscription. Internet adds repository context; it does not provide the model.

Designed for a 4 GB RAM ARM64 phone. The GGUF is about 469 MiB and the debug APK about 483 MiB. First use copies the bundled model into private app storage: allow roughly 1.1 GB free storage. Android 8+ and a current Android System WebView are required. This is a debug build, not a Play Store release.

## Use it

1. Install the APK, open Trident, and allow notifications from Settings if wanted.
2. **Workspace → Add files** imports UTF-8 source files, including from Google Drive's Android document provider. **Connect folder** grants read-only access to one selected folder. Folder discovery is bounded to 150 files, three levels deep. Providers that cannot expose folders can still supply individual files through the picker.
3. In Chat, ask for a small, specific fix. For example: “Read folder:src/calc.py. Fix add(a,b) so it returns their sum. Save the complete corrected file.” The local agent plans, fetches a copy, creates a revision, and posts progress.
4. **Inbox** contains job plans, progress, stop/continue controls, and immutable delivered revisions. **Preview** reads the source and opens a static, network-disabled rendering. **Ask for a fix** sends a revision back to chat. **Export copy** uses Android's create-document picker.
5. Jobs run in a user-started foreground service. Progress and delivery notifications link back into Trident. Android may kill/force-stop the process; interrupted jobs retain their plan and revisions and can be continued. It does not promise unattended execution after reboot or force-stop.

The compact model is a constrained assistant, not a guaranteed autonomous software engineer. Work is limited to a small source-file revision per job, a 16-step maximum, bounded context, and 1,800 generated tokens per action. Clear requests and small files work best. Imported text is limited to 256 KB; autonomous full-file editing is limited to 9,000 characters. Larger files are retained but blocked from partial replacement. Generated files are not automatically executed, tested, installed, or published. Inspect the results before use. The successful native-model check covers one actual arithmetic bug fix, not arbitrary application completion.

## No-delete boundary

The model has no delete, shell, arbitrary HTTP, phone-tap, keyboard, package-install, source-overwrite or GitHub-write tool. Original phone/Drive documents are never opened for writing. Generated edits are new app-private Inbox records. MCP discovery **and** dispatch enforce exact capability allowlists; model instructions cannot expand them. Export is initiated by the user through Android's picker. The old unauthenticated action bridge is no longer started.

Screen clicking cannot meet a hard no-delete guarantee because a click might delete a file. Therefore autonomous screen access is read-only. Stored jobs, imported copies and Inbox revisions persist in an atomic private journal; backup extraction is disabled to keep connection secrets private.

## Optional connections

- **GitHub RAG:** enter `owner/repository` in Settings. Public repositories need no token. For private repos supply a read-only token. Retrieval ranks supported code paths, fetches up to six relevant blobs, retains immutable SHA caches, and provides cited line windows. The model can also request a complete `github:path` file. This is bounded lexical RAG, not whole-repo vector indexing. Missing GitHub access does not block offline coding.
- **Android MCP:** install/start the existing [Android-mcp](https://github.com/justappgrabbin/Android-mcp) app, opt into its Accessibility service, and copy its bearer token into Trident Settings. Trident connects to `127.0.0.1:8765/mcp`, initializes MCP, lists tools, and permits only device/screen metadata and the accessibility hierarchy. Qwen Coder is text-only; it does not analyze screenshot pixels.
- **Computer MCP:** `computer/server.py` provides a read-only project directory and optional screenshots on your computer. Set a random `TRIDENT_MCP_TOKEN` of at least 24 characters, then run `python computer/server.py --root /path/to/project --host YOUR_PRIVATE_LAN_IP`. Put `http://YOUR_PRIVATE_LAN_IP:8766/mcp` and that token in Settings. Install the optional `mss` package on the computer for screenshots. Screenshots are for user inspection; file content supplies coding context. The companion has no shell, mouse, keyboard, write or delete tools. Use trusted private LAN HTTP or an HTTPS tunnel.
- **Google Drive:** current access is through the Android document provider, not broad Drive OAuth or autonomous whole-Drive search. Pick files or a provider-supported folder once; subsequent folder reads do not require uploading files into this chat.

Tokens stay in Android private preferences and are never returned to the WebView snapshot. All GitHub requests go to `api.github.com`; redirects are refused. User-selected computer endpoints permit HTTP only for localhost/private IPs; public hosts require HTTPS. The MCP client supports stateless JSON Streamable HTTP like Android-mcp; SSE/sessionful MCP servers are outside this implementation.

## Build

Install JDK 17, Gradle 8.9, Android SDK 35/build-tools, NDK 27.0.12077973 and CMake 3.22.1. Point `ANDROID_HOME` or `local.properties` at the SDK.

```sh
bash scripts/prepare-model.sh
gradle :app:assembleDebug
```

`prepare-model.sh` fetches pinned llama.cpp source and the complete official GGUF, and verifies the model's SHA-256. The model is packaged as an uncompressed APK asset, never downloaded by the installed app. GitHub's 100 MB file limit prevents committing GGUF weights directly; the build workflow embeds them in every APK. Output: `app/build/outputs/apk/debug/app-debug.apk`.

llama.cpp pin: `17701e48d7fa3b7dac949cb9e5e6d241a382333c`. Official Qwen model revision: `ebb2015119c907b064c512bf053e945850b5875f`. Weight SHA-256: `1d9614638d18024d0fbb36575a15f1302a3adf044df10345688ec4f6e1c4ff32`. The model and runtime notices are included in APK assets.

## Native-model verification on a development computer

After preparing the model, configure and build `app/src/main/cpp` using CMake with JDK 17 in `JAVA_HOME`, then run `JAVA_HOME=/path/to/jdk17 TRIDENT_NATIVE_BUILD=/path/to/native-build python scripts/test-native.py`. The same JNI source supports a host build solely for verification; it is not a server needed by the Android app.

## Validation

- ARM64 Android APK compiled with its native JNI library and full model asset; signature and asset-integrity checks recorded in `verification/package.json`.
- Actual bundled GGUF + the same JNI inference code passed plan → file read → corrected complete source → completion on a Linux host. `verification/native-model-smoke.json` records the generated actions.
- UI navigation, queue/stop dispatch, settings, safe text preview, revision feedback, and responsive sizes checked in Chromium. The browser test uses a fixture for the Android bridge; it does not claim to run Android there.
- Computer companion tests cover bearer authentication, path traversal/symlink rejection, original preservation, and destructive-tool rejection.
- Physical phone installation, Accessibility, provider permissions, notifications, screen-off lifecycle and performance remain device acceptance checks. No physical Android device was available in this workspace.
