// node --test apps/mobile/plugins/withHealthConnectPermissionDelegate.test.js
const assert = require("node:assert/strict");
const { test } = require("node:test");

const { addDelegate } = require("./withHealthConnectPermissionDelegate");

// The shape of Expo SDK 51's generated MainActivity.kt.
const EXPO_51 = `package app.weyos.client

import android.os.Build
import android.os.Bundle

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    setTheme(R.style.AppTheme);
    super.onCreate(null)
  }
}
`;

test("adds the import and registers the delegate right after super.onCreate", () => {
  const out = addDelegate(EXPO_51);
  assert.match(out, /^package app\.weyos\.client\n\nimport dev\.matinzd\.healthconnect\.permissions\.HealthConnectPermissionDelegate\n/);
  assert.match(out, /super\.onCreate\(null\)\n {4}HealthConnectPermissionDelegate\.setPermissionDelegate\(this\)\n/);
});

test("is idempotent", () => {
  const once = addDelegate(EXPO_51);
  assert.equal(addDelegate(once), once);
});

test("fails loudly if the template has no super.onCreate", () => {
  assert.throws(() => addDelegate("package x\n\nclass MainActivity\n"), /super\.onCreate/);
});
