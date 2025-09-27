# capacitor-plugin-file-opener

Capacitor plugin to open files

## Install

```bash
npm install @whiteguru/capacitor-plugin-file-opener
npx cap sync
```

### or for Capacitor 4.x

```bash
npm install @whiteguru/capacitor-plugin-file-opener@^4.0.0
npx cap sync
```

### or for Capacitor 3.x

```bash
npm install @whiteguru/capacitor-plugin-file-opener@1.1.4
npx cap sync
```

### Setup Android

Add or update next lines inside `<manifest>` tag on your `AndroidManifest.xml`

```
<manifest>

  <!-- Rest of manifest -->

  <queries>
    <intent>
      <action android:name="android.intent.action.VIEW" />
      <!-- If you don't know the MIME type in advance, set "mimeType" to "*/*". -->
      <data android:mimeType="application/pdf" />
    </intent>
  </queries>
</manifest>
```

## API

<docgen-index>

* [`open(...)`](#open)
* [Interfaces](#interfaces)

</docgen-index>

<docgen-api>
<!--Update the source file JSDoc comments and rerun docgen to update the docs below-->

### open(...)

```typescript
open(options: FileOpenerOptions) => Promise<void>
```

| Param         | Type                                                            |
| ------------- | --------------------------------------------------------------- |
| **`options`** | <code><a href="#fileopeneroptions">FileOpenerOptions</a></code> |

--------------------


### Interfaces


#### FileOpenerOptions

| Prop       | Type                | Description                             |
| ---------- | ------------------- | --------------------------------------- |
| **`path`** | <code>string</code> | Path to file                            |
| **`mime`** | <code>string</code> | Mime to select (optional, android only) |

</docgen-api>
