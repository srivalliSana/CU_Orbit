import { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  runOnJS,
} from "react-native-reanimated";

const COLORS = ["#3DC496", "#FF876F", "#FFD166", "#06D6A0", "#5B9BD5"];
const COUNT = 22;

function Piece({ index, onDone }: { index: number; onDone?: () => void }) {
  const progress = useSharedValue(0);
  const angle = (index / COUNT) * Math.PI * 2 + Math.random() * 0.4;
  const distance = 70 + Math.random() * 90;
  const dx = Math.cos(angle) * distance;
  const dy = Math.sin(angle) * distance - 40;
  const color = COLORS[index % COLORS.length];
  const size = 6 + Math.random() * 5;

  useEffect(() => {
    progress.value = withDelay(
      Math.random() * 80,
      withTiming(1, { duration: 900 + Math.random() * 300, easing: Easing.out(Easing.cubic) }, (finished) => {
        if (finished && index === 0 && onDone) runOnJS(onDone)();
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [
      { translateX: dx * progress.value },
      { translateY: dy * progress.value + progress.value * progress.value * 60 },
      { rotate: `${progress.value * 360 * (index % 2 === 0 ? 1 : -1)}deg` },
    ],
  }));

  return <Animated.View style={[styles.piece, { backgroundColor: color, width: size, height: size * 0.6 }, style]} />;
}

/** A brief particle burst for "you got it right" on a Channel Quiz — mount
 *  conditionally (`active`) over the poll bubble; unmounts itself via
 *  `onDone` once the animation finishes. No library: ~20 rects flung out
 *  from center and faded, not worth a dependency for one celebratory beat. */
export default function ConfettiBurst({ onDone }: { onDone?: () => void }) {
  return (
    <Animated.View pointerEvents="none" style={styles.container}>
      {Array.from({ length: COUNT }).map((_, i) => (
        <Piece key={i} index={i} onDone={onDone} />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 0,
    height: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
  },
  piece: {
    position: "absolute",
    borderRadius: 1,
  },
});
