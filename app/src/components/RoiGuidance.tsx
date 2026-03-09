import React from "react";
import { Text, View, StyleSheet } from "react-native";

// v1 guidance shell. In app integration, replace overlay internals with react-cam-roi primitives.
export function RoiGuidance(): JSX.Element {
  return (
    <View style={styles.overlay}>
      <View style={styles.roiBox} />
      <Text style={styles.text}>Align your face inside the box</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center"
  },
  roiBox: {
    width: 200,
    height: 200,
    borderColor: "#00c853",
    borderWidth: 2,
    borderRadius: 12,
    backgroundColor: "transparent"
  },
  text: {
    marginTop: 12,
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600"
  }
});
