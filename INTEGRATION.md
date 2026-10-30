# Trident in SynthAi Computer

Trident is an application mounted in the existing SynthAi `ComputerRuntime`.
The full Synthia Generative Address & Morphology assembly is a Computer service.
All 19 source Klein tools are registered in the Computer and remain executed by
their original Synthia implementations. Chat and tool tasks run through the
Computer process fabric, with Computer state and event records.

## Run on an Android phone

1. Extract this repository in Termux's private home directory.
2. Run `bash mobile/termux-bootstrap.sh` to install Node.js and start Computer.
3. Install the Trident APK built from this branch and open it. It checks the
   actual backend audit and provides Klein/Morph selection and a live tool list.

For later starts, run `bash mobile/start-trident.sh`. No npm packages are needed.
Keep Termux running and allow its background operation in Android battery settings.
The APK does not bundle Termux or Node.js. This is a phone-local Computer process,
not a remote desktop requirement. These launch commands still need phone testing.

On desktop, use Node.js 22+ and `npm start`. The backend UI is at
`http://127.0.0.1:8765`; Android connects to that address on its own device.
For an emulator connected to a desktop server use `adb reverse tcp:8765 tcp:8765`.
Android Hands owns 8787, so the Computer server deliberately uses 8765.

## Tools

Open **Klein tools** to read the live catalog. Run a JSON step array explicitly:

```json
[{"toolId":"outline-paraphraser","input":{"triples":[{"subject":"Trident","relation":"runs inside","object":"SynthAi Computer"}]}}]
```

The result contains actual tool output and shared state. Tools retain their
original input validation and approval requirements. Registering a browser tool
does not install a native browser executor or grant phone permissions.

## What has and hasn't been verified

Run `npm test` for Computer mounting, HTTP chat/tools, persistence, Android
JavaScript bridge behavior and the imported backend suites. The Android APK
build is configured in GitHub Actions; a physical-phone run is still required.

Klein/Morph chat currently produces structured semantic/grammar analysis. This
integration does not turn it into a pretrained general conversational LLM.
Chat receipts/transcripts and Computer state persist in `workspace/`. This does
not checkpoint all of Synthia's in-memory learned tool state across restarts.
The Android file-picker, terminal, Inbox, Goals and Digest still need their
separate feature work; this integration covers the Computer, chat and Klein tools.

## Source snapshots

- Trident Android base: `justappgrabbin/Trident-float`,
  `1ef5af2b02925e3c907879bc50d8de3bd44b8065`.
- `computer/`: runtime source from `justappgrabbin/SynthAi`,
  `b013bfa2cf8a85bf3e34a1af0de04c44ba70c94c`.
  `TridentHost.mjs` is the new mount. Optional lazy Computer donor services are
  not included in this focused runtime snapshot and are not used by Trident.
- `backend/`: transitive source dependency snapshot and root tests from
  `justappgrabbin/Generative-address-system`,
  `ce1704d5d53d5729b499463f7eeaf5dcd5091550`.
  Its server now mounts through `TridentHost` and defaults to 8765.
- Phone launcher pattern: `justappgrabbin/Synthai2`,
  `cfbe3ee3018c41fc8abe6e1734eee5b630595a3f`,
  `mobile/termux-bootstrap.sh`.

The complete original repositories and historical archives remain upstream;
this snapshot includes the dependencies used by this mounted application.
