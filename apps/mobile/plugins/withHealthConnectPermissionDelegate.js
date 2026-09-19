/**
 * Registers react-native-health-connect's permission delegate in MainActivity.onCreate.
 *
 * From v2 the library requests permissions through registerForActivityResult, which has to be
 * wired up while the activity is being created. The expo-health-connect config plugin adds the
 * manifest entries but not this call, and without it requestPermission() crashes at runtime
 * ("lateinit property requestPermission has not been initialized").
 *
 * Idempotent: running prebuild twice doesn't insert the call twice.
 */
const { withMainActivity } = require("@expo/config-plugins");

const IMPORT = "import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate";
const CALL = "HealthConnectPermissionDelegate.setPermissionDelegate(this)";

function addDelegate(source) {
  if (source.includes(CALL)) return source;

  let out = source;
  if (!out.includes(IMPORT)) {
    out = out.replace(/^(package [^\n]+\n)/m, `$1\n${IMPORT}\n`);
  }
  const superCall = /(\n(\s*)super\.onCreate\([^)]*\)\s*\n)/;
  if (!superCall.test(out)) {
    throw new Error(
      "withHealthConnectPermissionDelegate: no super.onCreate(...) in MainActivity. The Expo " +
        "template changed; update this plugin rather than shipping without the delegate.",
    );
  }
  return out.replace(superCall, `$1$2${CALL}\n`);
}

module.exports = function withHealthConnectPermissionDelegate(config) {
  return withMainActivity(config, (cfg) => {
    if (cfg.modResults.language !== "kt") {
      throw new Error("withHealthConnectPermissionDelegate expects a Kotlin MainActivity");
    }
    cfg.modResults.contents = addDelegate(cfg.modResults.contents);
    return cfg;
  });
};

module.exports.addDelegate = addDelegate;
