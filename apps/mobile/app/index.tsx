import { StyleSheet, Text, View } from "react-native";

/**
 * Placeholder home screen.
 *
 * The first real screen is the daily decision view, and it should render a Decision from
 * @weyos/shared-schema — including the `because` reasons. Showing the user why beats
 * showing them what; it is also the thing that makes the product defensible.
 *
 * Do not build UI against invented data shapes. Run the engine CLI, paste a real Decision
 * into a fixture, and build against that:
 *
 *   python -m weyos_engine.cli --persona sarah --state crash --json
 */
export default function Home() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Weyos</Text>
      <Text style={styles.subtitle}>Dev build works. Now prove a real sensor read.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 32, fontWeight: "600" },
  subtitle: { marginTop: 8, opacity: 0.6, textAlign: "center" },
});
