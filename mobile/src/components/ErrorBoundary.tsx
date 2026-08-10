import { Component, type ReactNode } from "react";
import { Button, StyleSheet, Text, View } from "react-native";

import { colors } from "../theme/colors";

// Mirrors web/src/components/ErrorBoundary.jsx — nothing caught a render
// error before this, so a bug anywhere in the tree looked identical to
// the screen just "not opening": blank, no feedback, no way to recover
// short of force-closing the app.
interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>{this.state.error.message}</Text>
          <Button title="Try again" onPress={() => this.setState({ error: null })} color={colors.primary} />
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 12,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
  },
  message: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
  },
});
