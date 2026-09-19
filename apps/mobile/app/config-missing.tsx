import { Screen, Sub, Title } from "../src/components/form";
import { missingConfig } from "../src/lib/config";

/** Shown by a build that lacks its API or Supabase settings. Better than failing silently. */
export default function ConfigMissing() {
  return (
    <Screen>
      <Title text="This build isn't configured" />
      <Sub
        text={
          "It was built without: " +
          missingConfig.join(", ") +
          ". Set them in the build profile in eas.json and rebuild."
        }
      />
    </Screen>
  );
}
